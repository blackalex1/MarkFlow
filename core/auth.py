import os
import pyotp
import qrcode
import qrcode.image.svg
import re
from io import BytesIO
from fastapi import APIRouter, Depends, HTTPException, status, Response, Request
from pydantic import BaseModel
from itsdangerous import URLSafeTimedSerializer, BadSignature, SignatureExpired

from core.database import (
    verify_password, get_user_by_username, set_user_totp_secret, 
    get_setting, add_audit_log, create_session, get_session, 
    delete_session, clear_user_sessions
)

# Helper to get a serializer for a specific secret
def get_serializer(secret_key_name: str):
    secret = get_setting(secret_key_name) or "fallback-secret-key"
    return URLSafeTimedSerializer(secret)

class ChangePasswordRequest(BaseModel):
    old_password: str
    new_password: str

class LoginRequest(BaseModel):
    username: str
    password: str
    totp_code: str = None

class TOTPVerifyRequest(BaseModel):
    totp_code: str
    secret: str

router = APIRouter()

def validate_password_complexity(password: str):
    if len(password) < 8:
        raise HTTPException(status_code=400, detail="Пароль должен быть не менее 8 символов")
    if not re.search(r"\d", password):
        raise HTTPException(status_code=400, detail="Пароль должен содержать хотя бы одну цифру")
    if not re.search(r"[A-Z]", password):
        raise HTTPException(status_code=400, detail="Пароль должен содержать хотя бы одну заглавную букву")

def create_session_cookie(response: Response, username: str, is_admin: bool):
    # 1. Create session in DB
    session_id = create_session(username)
    
    # 2. Sign the session ID
    serializer = get_serializer("SESSION_SECRET")
    token = serializer.dumps(session_id)
    
    # 3. Set cookie
    response.set_cookie(
        key="session",
        value=token,
        httponly=True,
        secure=True, 
        max_age=86400 * 7, 
        samesite="strict"
    )

def get_current_user(request: Request):
    token = request.cookies.get("session")
    if not token:
        return None
    try:
        # 1. Verify signature
        serializer = get_serializer("SESSION_SECRET")
        session_id = serializer.loads(token, max_age=86400 * 7)
        
        # 2. Verify in DB
        user_data = get_session(session_id)
        if user_data:
            user_data["session_id"] = session_id # Keep ID for logout
            return user_data
    except (BadSignature, SignatureExpired):
        pass
    return None

# Role Hierarchy (higher number = more permissions)
ROLES = {
    "guest": 10,
    "reporter": 20,
    "developer": 30,
    "maintainer": 40,
    "owner": 50
}

def check_role(user, required_role: str):
    if not user:
        raise HTTPException(status_code=401, detail="Not logged in")
    user_role = user.get("role", "guest")
    if ROLES.get(user_role, 0) < ROLES.get(required_role, 0):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN, 
            detail=f"Access denied. Required role: {required_role}"
        )
    return user

def get_reporter_user(request: Request):
    return check_role(get_current_user(request), "reporter")

def get_developer_user(request: Request):
    return check_role(get_current_user(request), "developer")

def get_maintainer_user(request: Request):
    return check_role(get_current_user(request), "maintainer")

def get_owner_user(request: Request):
    return check_role(get_current_user(request), "owner")

def get_admin_user(request: Request):
    # Backward compatibility: Admin is at least a Maintainer
    return get_maintainer_user(request)

from slowapi import Limiter
from slowapi.util import get_remote_address
limiter = Limiter(key_func=get_remote_address)

@router.post("/login")
@limiter.limit("5/minute")
def login(request: Request, login_data: LoginRequest, response: Response):
    user = get_user_by_username(login_data.username)
    if not user or not verify_password(login_data.password, user["password_hash"]):
        add_audit_log(login_data.username, "login_failed", f"IP: {request.client.host}")
        raise HTTPException(status_code=401, detail="Invalid username or password")
    
    # Check 2FA
    if user["totp_secret"]:
        if not login_data.totp_code:
            raise HTTPException(status_code=401, detail="2fa_required")
        
        totp = pyotp.TOTP(user["totp_secret"])
        if not totp.verify(login_data.totp_code):
            add_audit_log(login_data.username, "2fa_failed", f"IP: {request.client.host}")
            raise HTTPException(status_code=401, detail="Invalid 2FA code")
            
    create_session_cookie(response, user["username"], bool(user["is_admin"]))
    add_audit_log(user["username"], "login_success", f"IP: {request.client.host}")
    return {"message": "Logged in successfully", "username": user["username"]}

@router.get("/2fa/setup")
def setup_2fa(user=Depends(get_admin_user)):
    secret = pyotp.random_base32()
    totp = pyotp.TOTP(secret)
    provisioning_uri = totp.provisioning_uri(name=user["username"], issuer_name="GlebDocs")
    
    factory = qrcode.image.svg.SvgPathImage
    img = qrcode.make(provisioning_uri, image_factory=factory)
    stream = BytesIO()
    img.save(stream)
    svg_data = stream.getvalue().decode('utf-8')
    
    return {"secret": secret, "qr_svg": svg_data}

@router.post("/2fa/verify")
def verify_2fa(data: TOTPVerifyRequest, user=Depends(get_admin_user)):
    totp = pyotp.TOTP(data.secret)
    if totp.verify(data.totp_code):
        set_user_totp_secret(user["username"], data.secret)
        add_audit_log(user["username"], "2fa_enabled")
        return {"message": "2FA successfully enabled"}
    raise HTTPException(status_code=400, detail="Invalid 2FA code")

@router.post("/2fa/disable")
def disable_2fa(user=Depends(get_admin_user)):
    set_user_totp_secret(user["username"], None)
    add_audit_log(user["username"], "2fa_disabled")
    return {"message": "2FA successfully disabled"}

@router.post("/change-password")
def change_password(data: ChangePasswordRequest, user=Depends(get_current_user)):
    if not user:
        raise HTTPException(status_code=401, detail="Not logged in")
    
    validate_password_complexity(data.new_password)
    
    db_user = get_user_by_username(user["username"])
    if not db_user or not verify_password(data.old_password, db_user["password_hash"]):
        add_audit_log(user["username"], "password_change_failed", "Invalid old password")
        raise HTTPException(status_code=400, detail="Invalid old password")
    
    from core.database import update_user_password
    update_user_password(user["username"], data.new_password)
    add_audit_log(user["username"], "password_changed")
    
    # Optional: clear other sessions on password change for security
    clear_user_sessions(user["username"])
    
    return {"message": "Password updated successfully. All other sessions logged out."}

@router.post("/logout-all")
def logout_all(user=Depends(get_current_user), response: Response = None):
    if not user:
        raise HTTPException(status_code=401, detail="Not logged in")
    clear_user_sessions(user["username"])
    add_audit_log(user["username"], "logout_all_devices")
    if response:
        response.delete_cookie("session")
    return {"message": "Logged out from all devices"}

@router.get("/logout")
@router.post("/logout")
def logout(request: Request, response: Response):
    user = get_current_user(request)
    if user:
        delete_session(user["session_id"])
        add_audit_log(user["username"], "logout")
    response.delete_cookie("session")
    return {"message": "Logged out"}

@router.get("/me")
def get_me(request: Request):
    user = get_current_user(request)
    if not user:
        return {"logged_in": False}
    
    return {
        "logged_in": True, 
        "username": user["username"], 
        "is_admin": user.get("is_admin", False),
        "role": user.get("role", "guest"),
        "two_factor_enabled": bool(user.get("totp_secret"))
    }

# --- Administrative Endpoints (Owner only) ---

class UserCreate(BaseModel):
    username: str
    password: str
    role: str = 'guest'

class RoleUpdate(BaseModel):
    role: str

@router.get("/users")
def api_list_users(user=Depends(get_owner_user)):
    from core.database import list_users
    return list_users()

@router.post("/users")
def api_create_user(data: UserCreate, user=Depends(get_owner_user)):
    from core.database import create_user
    try:
        create_user(data.username, data.password, data.role)
        add_audit_log(user["username"], "user_created", f"User: {data.username}, Role: {data.role}")
        return {"message": f"User {data.username} created"}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

@router.delete("/users/{username}")
def api_delete_user(username: str, user=Depends(get_owner_user)):
    from core.database import delete_user
    if username == user["username"]:
        raise HTTPException(status_code=400, detail="Cannot delete yourself")
    delete_user(username)
    add_audit_log(user["username"], "user_deleted", f"User: {username}")
    return {"message": "User deleted"}

@router.put("/users/{username}/role")
def api_update_role(username: str, data: RoleUpdate, user=Depends(get_owner_user)):
    from core.database import update_user_role
    update_user_role(username, data.role)
    add_audit_log(user["username"], "user_role_updated", f"User: {username}, New Role: {data.role}")
    return {"message": "Role updated"}

@router.get("/audit-logs")
def api_get_logs(user=Depends(get_owner_user)):
    from core.database import get_audit_logs
    return get_audit_logs()
