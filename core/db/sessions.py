import secrets
from datetime import datetime, timedelta
from .base import db_session

def init_table(cursor):
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS sessions (
            id TEXT PRIMARY KEY,
            username TEXT,
            expires_at DATETIME
        )
    ''')

def create_session(username: str, days: int = 7) -> str:
    session_id = secrets.token_urlsafe(32)
    expires_at = datetime.now() + timedelta(days=days)
    with db_session() as conn:
        cursor = conn.cursor()
        cursor.execute('INSERT INTO sessions (id, username, expires_at) VALUES (?, ?, ?)', (session_id, username, expires_at))
    return session_id

def get_session(session_id: str):
    with db_session() as conn:
        cursor = conn.cursor()
        # Join with users to get is_admin status
        cursor.execute('''
            SELECT sessions.username, users.is_admin, sessions.expires_at, users.role, users.totp_secret
            FROM sessions 
            JOIN users ON sessions.username = users.username 
            WHERE sessions.id = ?
        ''', (session_id,))
        row = cursor.fetchone()
        
        if row:
            expires_at = datetime.fromisoformat(row[2])
            if expires_at > datetime.now():
                from .crypto import decrypt_value
                return {
                    "username": row[0], 
                    "is_admin": bool(row[1]), 
                    "role": row[3],
                    "totp_secret": decrypt_value(row[4]) if row[4] else None
                }
            else:
                # We can't call delete_session here directly because it would try to open another session on the same conn 
                # (or nested with db_session() which might be tricky depending on sqlite)
                # But since we are in db_session, we can just execute the delete on the current conn.
                cursor.execute('DELETE FROM sessions WHERE id = ?', (session_id,))
    return None

def delete_session(session_id: str):
    with db_session() as conn:
        cursor = conn.cursor()
        cursor.execute('DELETE FROM sessions WHERE id = ?', (session_id,))

def clear_user_sessions(username: str):
    with db_session() as conn:
        cursor = conn.cursor()
        cursor.execute('DELETE FROM sessions WHERE username = ?', (username,))
