from fastapi import Request, HTTPException, status
from itsdangerous import BadSignature, SignatureExpired
from core.database import get_session
from .utils import get_serializer

# Role Hierarchy
ROLES = {
    "guest": 10,
    "reporter": 20,
    "developer": 30,
    "maintainer": 40,
    "owner": 50
}

def get_current_user(request: Request):
    token = request.cookies.get("session")
    if not token:
        return None
    try:
        serializer = get_serializer("SESSION_SECRET")
        session_id = serializer.loads(token, max_age=86400 * 7)
        user_data = get_session(session_id)
        if user_data:
            user_data["session_id"] = session_id
            return user_data
    except (BadSignature, SignatureExpired):
        pass
    return None

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
    return get_maintainer_user(request)
