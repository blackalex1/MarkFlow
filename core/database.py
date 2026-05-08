import secrets
from .db.base import get_db, pwd_context, DB_PATH
from .db.users import (
    get_user_by_username, set_user_totp_secret, list_users, 
    create_user, delete_user, update_user_role, update_user_password, verify_password
)
from .db.sessions import create_session, get_session, delete_session, clear_user_sessions
from .db.settings import get_setting, set_setting
from .db.audit import add_audit_log, get_audit_logs
from .db.fts import update_fts_index, delete_fts_index, search_fts, reindex_all_docs, is_image_referenced
from .metadata import is_public, set_public, get_file_status, set_file_status, rename_metadata

import sqlite3

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
            details TEXT,
            ip_address TEXT
        )
    ''')
    try:
        cursor.execute('ALTER TABLE audit_logs ADD COLUMN ip_address TEXT')
    except sqlite3.OperationalError:
        pass

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
        import secrets
        import string
        
        # Generate random secure password
        alphabet = string.ascii_letters + string.digits
        random_password = ''.join(secrets.choice(alphabet) for _ in range(12))
        
        hashed_password = pwd_context.hash(random_password)
        cursor.execute('INSERT INTO users (username, password_hash, is_admin, role) VALUES (?, ?, ?, ?)', 
                       ('admin', hashed_password, True, 'owner'))
        
        print("\n" + "="*60)
        print(" SECURITY WARNING: INITIAL SETUP ".center(60, "="))
        print("="*60)
        print(f" Admin user created successfully!")
        print(f" Username: admin")
        print(f" Password: {random_password}")
        print("="*60)
        print(" PLEASE SAVE THIS PASSWORD NOW! ".center(60, "="))
        print(" It will not be shown again. ".center(60, "="))
        print("="*60 + "\n")
    else:
        # Ensure existing admin has owner role
        cursor.execute('UPDATE users SET role = ? WHERE username = ?', ('owner', 'admin'))
    
    # Initialize Multiple Secrets in DB if not present
    for key_name in ['SESSION_SECRET', 'RECOVERY_SECRET', 'ENCRYPTION_SECRET']:
        cursor.execute('SELECT * FROM settings WHERE key = ?', (key_name,))
        if not cursor.fetchone():
            new_secret = secrets.token_urlsafe(32)
            cursor.execute('INSERT INTO settings (key, value) VALUES (?, ?)', (key_name, new_secret))
    # Create FTS5 virtual table for documentation search
    try:
        cursor.execute('CREATE VIRTUAL TABLE IF NOT EXISTS fts_docs USING fts5(path, name, content)')
    except sqlite3.OperationalError:
        pass

    conn.commit()
    conn.close()
