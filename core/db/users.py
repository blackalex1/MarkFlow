from .base import db_session, pwd_context
from .audit import add_audit_log
from .crypto import encrypt_value, decrypt_value

def get_user_by_username(username: str):
    with db_session() as conn:
        cursor = conn.cursor()
        cursor.execute('SELECT * FROM users WHERE username = ?', (username,))
        user = cursor.fetchone()
        if user:
            user = dict(user)
            if user.get("totp_secret"):
                user["totp_secret"] = decrypt_value(user["totp_secret"])
        return user

def set_user_totp_secret(username: str, secret: str):
    with db_session() as conn:
        cursor = conn.cursor()
        encrypted_secret = encrypt_value(secret) if secret else None
        cursor.execute('UPDATE users SET totp_secret = ? WHERE username = ?', (encrypted_secret, username))

def list_users():
    with db_session() as conn:
        cursor = conn.cursor()
        cursor.execute('SELECT username, is_admin, role FROM users')
        rows = cursor.fetchall()
        return [dict(row) for row in rows]

def create_user(username: str, password_plain: str, role: str = 'guest'):
    with db_session() as conn:
        cursor = conn.cursor()
        hashed_password = pwd_context.hash(password_plain)
        cursor.execute('INSERT INTO users (username, password_hash, role) VALUES (?, ?, ?)', (username, hashed_password, role))

def delete_user(username: str):
    if username == 'admin': return # Protect main admin
    with db_session() as conn:
        cursor = conn.cursor()
        cursor.execute('DELETE FROM users WHERE username = ?', (username,))
        # Also clear their sessions
        cursor.execute('DELETE FROM sessions WHERE username = ?', (username,))

def update_user_role(username: str, role: str):
    with db_session() as conn:
        cursor = conn.cursor()
        cursor.execute('UPDATE users SET role = ? WHERE username = ?', (role, username))

def update_user_password(username: str, new_password: str):
    with db_session() as conn:
        cursor = conn.cursor()
        hashed_password = pwd_context.hash(new_password)
        cursor.execute('UPDATE users SET password_hash = ? WHERE username = ?', (hashed_password, username))

def verify_password(plain_password, hashed_password):
    return pwd_context.verify(plain_password, hashed_password)
