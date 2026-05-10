import secrets
from datetime import datetime, timedelta
from .base import get_db

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
            from .crypto import decrypt_value
            return {
                "username": row[0], 
                "is_admin": bool(row[1]), 
                "role": row[3],
                "totp_secret": decrypt_value(row[4]) if row[4] else None
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
