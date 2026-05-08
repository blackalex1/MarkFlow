import re
from fastapi import Response
from itsdangerous import URLSafeTimedSerializer
from core.database import get_setting, create_session

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

def create_session_cookie(response: Response, username: str):
    session_id = create_session(username)
    serializer = get_serializer("SESSION_SECRET")
    token = serializer.dumps(session_id)
    
    response.set_cookie(
        key="session",
        value=token,
        httponly=True,
        secure=True, 
        max_age=86400 * 7, 
        samesite="strict"
    )
