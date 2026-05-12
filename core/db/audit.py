import sqlite3
from .base import get_db

def init_table(cursor):
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS audit_logs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
            username TEXT,
            action TEXT,
            details TEXT,
            ip_address TEXT
        )
    ''')
    try: cursor.execute('ALTER TABLE audit_logs ADD COLUMN ip_address TEXT')
    except sqlite3.OperationalError: pass

def add_audit_log(username: str, action: str, details: str = "", ip_address: str = ""):
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute('INSERT INTO audit_logs (username, action, details, ip_address) VALUES (?, ?, ?, ?)', 
                   (username, action, details, ip_address))
    conn.commit()
    conn.close()

def get_audit_logs(limit: int = 100):
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute('SELECT timestamp, username, action, details, ip_address FROM audit_logs ORDER BY timestamp DESC LIMIT ?', (limit,))
    rows = cursor.fetchall()
    conn.close()
    return [dict(row) for row in rows]
