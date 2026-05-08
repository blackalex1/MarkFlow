from .base import get_db

def add_audit_log(username: str, action: str, details: str = ""):
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute('INSERT INTO audit_logs (username, action, details) VALUES (?, ?, ?)', (username, action, details))
    conn.commit()
    conn.close()

def get_audit_logs(limit: int = 100):
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute('SELECT timestamp, username, action, details FROM audit_logs ORDER BY timestamp DESC LIMIT ?', (limit,))
    rows = cursor.fetchall()
    conn.close()
    return [dict(row) for row in rows]
