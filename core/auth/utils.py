import re
from typing import Optional
from fastapi import Request, Response
from itsdangerous import URLSafeTimedSerializer
from core.db.settings import get_setting
from core.db.sessions import create_session

def get_serializer(secret_key_name: str):
    secret = get_setting(secret_key_name)
    if not secret:
        raise RuntimeError(f"Missing critical security setting: {secret_key_name}. Ensure DB is initialized.")
    return URLSafeTimedSerializer(secret)

def validate_password_complexity(password: str):
    if len(password) < 8:
        return "Пароль должен быть не менее 8 символов"
    if not re.search(r"\d", password):
        return "Пароль должен содержать хотя бы одну цифру"
    if not re.search(r"[A-Z]", password):
        return "Пароль должен содержать хотя бы одну заглавную букву"
    return None

def is_request_secure(request: Optional[Request] = None) -> bool:
    if not request:
        return False
    proto = request.headers.get("x-forwarded-proto", "")
    if proto:
        return proto.lower() == "https"
    return request.url.scheme == "https"

def create_session_cookie(response: Response, username: str, request: Optional[Request] = None):
    session_id = create_session(username)
    serializer = get_serializer("SESSION_SECRET")
    token = serializer.dumps(session_id)
    
    secure_cookie = is_request_secure(request)
    
    response.set_cookie(
        key="session",
        value=token,
        httponly=True,
        secure=secure_cookie, 
        max_age=86400 * 7, 
        samesite="lax"
    )
