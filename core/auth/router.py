import pyotp
import qrcode
import qrcode.image.svg
from io import BytesIO
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Response, Request
from pydantic import BaseModel
from .dependencies import get_current_user, get_admin_user, get_owner_user
from .utils import create_session_cookie, validate_password_complexity
from core.config import limiter, SECURITY_LIMITS

# Modular DB Imports
from core.db.users import (
    verify_password, get_user_by_username, set_user_totp_secret, 
    list_users, create_user, delete_user, update_user_role, update_user_password
)
from core.db.sessions import delete_session, clear_user_sessions
from core.db.audit import add_audit_log, get_audit_logs

router = APIRouter()

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

class UserCreate(BaseModel):
    username: str
    password: str
    role: str = 'guest'

class RoleUpdate(BaseModel):
    role: str

@router.post("/login")
@limiter.limit(SECURITY_LIMITS["login"])
def login(request: Request, login_data: LoginRequest, response: Response):
    user = get_user_by_username(login_data.username)
    if not user or not verify_password(login_data.password, user["password_hash"]):
        add_audit_log(login_data.username, "login_failed", "", ip_address=request.client.host)
        raise HTTPException(status_code=401, detail="Invalid username or password")
    
    if user["totp_secret"]:
        if not login_data.totp_code:
            raise HTTPException(status_code=401, detail="2fa_required")
        
        totp = pyotp.TOTP(user["totp_secret"])
        if not totp.verify(login_data.totp_code):
            add_audit_log(login_data.username, "2fa_failed", "", ip_address=request.client.host)
            raise HTTPException(status_code=401, detail="Invalid 2FA code")
            
    # Clean old sessions before creating a new one to prevent accumulation
    from core.services.session_service import clean_old_user_sessions
    clean_old_user_sessions(user["username"], keep_latest=5)
    
    create_session_cookie(response, user["username"])
    add_audit_log(user["username"], "login_success", "", ip_address=request.client.host)
    return {"message": "Logged in successfully", "username": user["username"]}

@router.get("/2fa/setup")
def setup_2fa(user=Depends(get_current_user)):
    if not user:
        raise HTTPException(status_code=401, detail="Not logged in")
    secret = pyotp.random_base32()
    totp = pyotp.TOTP(secret)
    provisioning_uri = totp.provisioning_uri(name=user["username"], issuer_name="MarkFlow")
    
    factory = qrcode.image.svg.SvgPathImage
    img = qrcode.make(provisioning_uri, image_factory=factory)
    stream = BytesIO()
    img.save(stream)
    svg_data = stream.getvalue().decode('utf-8')
    
    return {"secret": secret, "qr_svg": svg_data}

@router.post("/2fa/verify")
@limiter.limit(SECURITY_LIMITS["2fa_verify"])
def verify_2fa(request: Request, data: TOTPVerifyRequest, user=Depends(get_current_user)):
    if not user:
        raise HTTPException(status_code=401, detail="Not logged in")
    totp = pyotp.TOTP(data.secret)
    if totp.verify(data.totp_code):
        set_user_totp_secret(user["username"], data.secret)
        add_audit_log(user["username"], "2fa_enabled", ip_address=request.client.host)
        return {"message": "2FA successfully enabled"}
    raise HTTPException(status_code=400, detail="Invalid 2FA code")

class PasswordVerifyRequest(BaseModel):
    password: str
    totp_code: Optional[str] = None

@router.post("/2fa/disable")
@limiter.limit(SECURITY_LIMITS["2fa_verify"])
def disable_2fa(request: Request, data: PasswordVerifyRequest, user=Depends(get_current_user)):
    if not user:
        raise HTTPException(status_code=401, detail="Not logged in")
    
    db_user = get_user_by_username(user["username"])
    if not db_user or not verify_password(data.password, db_user["password_hash"]):
        add_audit_log(user["username"], "2fa_disable_failed", "Invalid password", ip_address=request.client.host)
        raise HTTPException(status_code=400, detail="Invalid password")

    if db_user["totp_secret"]:
        if not data.totp_code:
            raise HTTPException(status_code=401, detail="2FA code required to disable 2FA")
        totp = pyotp.TOTP(db_user["totp_secret"])
        if not totp.verify(data.totp_code):
            add_audit_log(user["username"], "2fa_disable_failed", "Invalid 2FA code", ip_address=request.client.host)
            raise HTTPException(status_code=400, detail="Invalid 2FA code")

    set_user_totp_secret(user["username"], None)
    add_audit_log(user["username"], "2fa_disabled", ip_address=request.client.host)
    return {"message": "2FA successfully disabled"}

@router.post("/change-password")
@limiter.limit(SECURITY_LIMITS["change_password"])
def change_password(request: Request, data: ChangePasswordRequest, user=Depends(get_current_user)):
    if not user:
        raise HTTPException(status_code=401, detail="Not logged in")
    
    err = validate_password_complexity(data.new_password)
    if err:
        raise HTTPException(status_code=400, detail=err)
    
    db_user = get_user_by_username(user["username"])
    if not db_user or not verify_password(data.old_password, db_user["password_hash"]):
        add_audit_log(user["username"], "password_change_failed", "Invalid old password", ip_address=request.client.host)
        raise HTTPException(status_code=400, detail="Invalid old password")
    
    update_user_password(user["username"], data.new_password)
    add_audit_log(user["username"], "password_changed", ip_address=request.client.host)
    clear_user_sessions(user["username"])
    
    return {"message": "Password updated successfully. All other sessions logged out."}

@router.post("/logout-all")
def logout_all(request: Request, user=Depends(get_current_user), response: Response = None):
    if not user:
        raise HTTPException(status_code=401, detail="Not logged in")
    clear_user_sessions(user["username"])
    add_audit_log(user["username"], "logout_all_devices", ip_address=request.client.host)
    if response:
        response.delete_cookie("session")
    return {"message": "Logged out from all devices"}

@router.post("/logout")
def logout(request: Request, response: Response):
    user = get_current_user(request)
    if user:
        delete_session(user["session_id"])
        add_audit_log(user["username"], "logout", ip_address=request.client.host)
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

@router.get("/users")
def api_list_users(user=Depends(get_owner_user)):
    return list_users()

@router.post("/users")
@limiter.limit(SECURITY_LIMITS["create_user"])
def api_create_user(request: Request, data: UserCreate, user=Depends(get_owner_user)):
    # Validate password complexity
    err = validate_password_complexity(data.password)
    if err:
        raise HTTPException(status_code=400, detail=err)
        
    # Validate role
    allowed_roles = ['guest', 'reporter', 'developer', 'maintainer', 'owner']
    if data.role not in allowed_roles:
        raise HTTPException(status_code=400, detail=f"Invalid role. Allowed: {', '.join(allowed_roles)}")

    try:
        create_user(data.username, data.password, data.role)
        add_audit_log(user["username"], "user_created", f"User: {data.username}, Role: {data.role}", ip_address=request.client.host)
        return {"message": f"User {data.username} created"}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

@router.delete("/users/{username}")
def api_delete_user(request: Request, username: str, user=Depends(get_owner_user)):
    if username == user["username"]:
        raise HTTPException(status_code=400, detail="Cannot delete yourself")
    delete_user(username)
    add_audit_log(user["username"], "user_deleted", f"User: {username}", ip_address=request.client.host)
    return {"message": "User deleted"}

@router.put("/users/{username}/role")
def api_update_role(request: Request, username: str, data: RoleUpdate, user=Depends(get_owner_user)):
    # Validate role
    allowed_roles = ['guest', 'reporter', 'developer', 'maintainer', 'owner']
    if data.role not in allowed_roles:
        raise HTTPException(status_code=400, detail=f"Invalid role. Allowed: {', '.join(allowed_roles)}")
        
    old_user = get_user_by_username(username)
    old_role = old_user.get('role', 'guest') if old_user else 'unknown'
    
    update_user_role(username, data.role)
    add_audit_log(user["username"], "user_role_updated", f"User: {username}, Old Role: {old_role}, New Role: {data.role}", ip_address=request.client.host)
    return {"message": "Role updated"}

@router.get("/audit-logs")
def api_get_logs(user=Depends(get_owner_user)):
    return get_audit_logs()
