from .base import get_db, pwd_context
from .audit import add_audit_log

def get_user_by_username(username: str):
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute('SELECT * FROM users WHERE username = ?', (username,))
    user = cursor.fetchone()
    conn.close()
    return user

def set_user_totp_secret(username: str, secret: str):
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute('UPDATE users SET totp_secret = ? WHERE username = ?', (secret, username))
    conn.commit()
    conn.close()

def list_users():
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute('SELECT username, is_admin, role FROM users')
    rows = cursor.fetchall()
    conn.close()
    return [dict(row) for row in rows]

def create_user(username: str, password_plain: str, role: str = 'guest'):
    conn = get_db()
    cursor = conn.cursor()
    hashed_password = pwd_context.hash(password_plain)
    cursor.execute('INSERT INTO users (username, password_hash, role) VALUES (?, ?, ?)', (username, hashed_password, role))
    conn.commit()
    conn.close()

def delete_user(username: str):
    if username == 'admin': return # Protect main admin
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute('DELETE FROM users WHERE username = ?', (username,))
    # Also clear their sessions
    cursor.execute('DELETE FROM sessions WHERE username = ?', (username,))
    conn.commit()
    conn.close()

def update_user_role(username: str, role: str):
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute('UPDATE users SET role = ? WHERE username = ?', (role, username))
    conn.commit()
    conn.close()

def update_user_password(username: str, new_password: str):
    conn = get_db()
    cursor = conn.cursor()
    hashed_password = pwd_context.hash(new_password)
    cursor.execute('UPDATE users SET password_hash = ? WHERE username = ?', (hashed_password, username))
    conn.commit()
    conn.close()

def verify_password(plain_password, hashed_password):
    return pwd_context.verify(plain_password, hashed_password)
