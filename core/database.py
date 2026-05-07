import sqlite3
import os
from datetime import datetime, timedelta
from passlib.context import CryptContext

DB_PATH = os.path.join(os.path.dirname(__file__), "app.db")
pwd_context = CryptContext(schemes=["pbkdf2_sha256"], deprecated="auto")

def get_db():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn

def init_db():
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT UNIQUE NOT NULL,
            password_hash TEXT NOT NULL,
            is_admin BOOLEAN NOT NULL DEFAULT 0,
            totp_secret TEXT DEFAULT NULL
        )
    ''')
    
    # Add missing columns if they don't exist
    try:
        cursor.execute('ALTER TABLE users ADD COLUMN totp_secret TEXT DEFAULT NULL')
    except sqlite3.OperationalError:
        pass
    try:
        cursor.execute('ALTER TABLE users ADD COLUMN role TEXT DEFAULT "guest"')
    except sqlite3.OperationalError:
        pass
    
    # Create settings table
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS settings (
            key TEXT PRIMARY KEY,
            value TEXT
        )
    ''')
    
    # Create audit_logs table
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS audit_logs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
            username TEXT,
            action TEXT,
            details TEXT
        )
    ''')

    # Create sessions table
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS sessions (
            id TEXT PRIMARY KEY,
            username TEXT,
            expires_at DATETIME
        )
    ''')
    
    # Check if admin user exists
    cursor.execute('SELECT * FROM users WHERE username = ?', ('admin',))
    if not cursor.fetchone():
        hashed_password = pwd_context.hash('admin')
        cursor.execute('INSERT INTO users (username, password_hash, is_admin, role) VALUES (?, ?, ?, ?)', ('admin', hashed_password, True, 'owner'))
    else:
        # Ensure existing admin has owner role
        cursor.execute('UPDATE users SET role = ? WHERE username = ?', ('owner', 'admin'))
    
    # Initialize Multiple Secrets in DB if not present
    import secrets
    for key_name in ['SESSION_SECRET', 'RECOVERY_SECRET', 'ENCRYPTION_SECRET']:
        cursor.execute('SELECT * FROM settings WHERE key = ?', (key_name,))
        if not cursor.fetchone():
            new_secret = secrets.token_urlsafe(32)
            cursor.execute('INSERT INTO settings (key, value) VALUES (?, ?)', (key_name, new_secret))
    
    conn.commit()
    conn.close()

def get_setting(key: str):
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute('SELECT value FROM settings WHERE key = ?', (key,))
    row = cursor.fetchone()
    conn.close()
    return row['value'] if row else None

def set_setting(key: str, value: str):
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)', (key, value))
    conn.commit()
    conn.close()

def verify_password(plain_password, hashed_password):
    return pwd_context.verify(plain_password, hashed_password)

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

def get_audit_logs(limit: int = 100):
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute('SELECT timestamp, username, action, details FROM audit_logs ORDER BY timestamp DESC LIMIT ?', (limit,))
    rows = cursor.fetchall()
    conn.close()
    return [dict(row) for row in rows]

def update_user_password(username: str, new_password: str):
    conn = get_db()
    cursor = conn.cursor()
    hashed_password = pwd_context.hash(new_password)
    cursor.execute('UPDATE users SET password_hash = ? WHERE username = ?', (hashed_password, username))
    conn.commit()
    conn.close()

def add_audit_log(username: str, action: str, details: str = ""):
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute('INSERT INTO audit_logs (username, action, details) VALUES (?, ?, ?)', (username, action, details))
    conn.commit()
    conn.close()

# --- Session Management ---
import secrets
from datetime import datetime, timedelta

def create_session(username: str, days: int = 7) -> str:
    session_id = secrets.token_urlsafe(32)
    expires_at = datetime.now() + timedelta(days=days)
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute('INSERT INTO sessions (id, username, expires_at) VALUES (?, ?, ?)', (session_id, username, expires_at))
    conn.commit()
    conn.close()
    return session_id

def get_session(session_id: str):
    conn = get_db()
    cursor = conn.cursor()
    # Join with users to get is_admin status
    cursor.execute('''
        SELECT sessions.username, users.is_admin, sessions.expires_at, users.role, users.totp_secret
        FROM sessions 
        JOIN users ON sessions.username = users.username 
        WHERE sessions.id = ?
    ''', (session_id,))
    row = cursor.fetchone()
    conn.close()
    
    if row:
        expires_at = datetime.fromisoformat(row[2])
        if expires_at > datetime.now():
            return {
                "username": row[0], 
                "is_admin": bool(row[1]), 
                "role": row[3],
                "totp_secret": row[4]
            }
        else:
            delete_session(session_id)
    return None

def delete_session(session_id: str):
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute('DELETE FROM sessions WHERE id = ?', (session_id,))
    conn.commit()
    conn.close()

def clear_user_sessions(username: str):
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute('DELETE FROM sessions WHERE username = ?', (username,))
    conn.commit()
    conn.close()
