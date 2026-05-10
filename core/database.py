import os
import json
import secrets
from .db.base import get_db, pwd_context, DB_PATH
from .db.users import (
    get_user_by_username, set_user_totp_secret, list_users, 
    create_user, delete_user, update_user_role, update_user_password, verify_password
)
from .db.sessions import create_session, get_session, delete_session, clear_user_sessions
from .db.settings import get_setting, set_setting
from .db.repos import (
    list_repositories, get_active_repository, get_repository, 
    add_repository, update_repository, delete_repository, set_active_repository
)
from .db.audit import add_audit_log, get_audit_logs
from .db.fts import update_fts_index, delete_fts_index, search_fts, reindex_all_docs, is_image_referenced
from .metadata import is_public, set_public, set_public_recursive, get_file_status, set_file_status, rename_metadata

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
            totp_secret TEXT DEFAULT NULL,
            role TEXT DEFAULT "guest"
        )
    ''')
    
    # Migrations for older installations
    try:
        cursor.execute('ALTER TABLE users ADD COLUMN totp_secret TEXT DEFAULT NULL')
    except sqlite3.OperationalError: pass
    try:
        cursor.execute('ALTER TABLE users ADD COLUMN role TEXT DEFAULT "guest"')
    except sqlite3.OperationalError: pass
    
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
    except sqlite3.OperationalError: pass

    # Create sessions table
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS sessions (
            id TEXT PRIMARY KEY,
            username TEXT,
            expires_at DATETIME
        )
    ''')

    # Create git_repositories table
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS git_repositories (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            slug TEXT UNIQUE NOT NULL,
            url TEXT NOT NULL,
            branch TEXT DEFAULT 'master',
            ssh_private_key TEXT,
            ssh_public_key TEXT,
            is_active BOOLEAN DEFAULT 0,
            auto_sync_interval INTEGER DEFAULT 0,
            sync_strategy TEXT DEFAULT 'rebase',
            last_auto_sync_at DATETIME,
            last_sync_status TEXT,
            last_sync_error TEXT,
            last_sync_at DATETIME,
            flatten_in_tree BOOLEAN DEFAULT 0
        )
    ''')
    
    # Temp keys for SSH generation
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS temp_ssh_keys (
            id TEXT PRIMARY KEY,
            private_key TEXT NOT NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    ''')

    # Migrations for older installations
    try:
        cursor.execute('ALTER TABLE git_repositories ADD COLUMN slug TEXT')
        cursor.execute('UPDATE git_repositories SET slug = "repo_" || id WHERE slug IS NULL')
    except sqlite3.OperationalError: pass

    try:
        cursor.execute('ALTER TABLE git_repositories ADD COLUMN last_sync_status TEXT')
    except sqlite3.OperationalError: pass
    try:
        cursor.execute('ALTER TABLE git_repositories ADD COLUMN last_sync_error TEXT')
    except sqlite3.OperationalError: pass
    try:
        cursor.execute('ALTER TABLE git_repositories ADD COLUMN last_sync_at DATETIME')
    except sqlite3.OperationalError: pass
    try:
        cursor.execute('ALTER TABLE git_repositories ADD COLUMN auto_sync_interval INTEGER DEFAULT 0')
    except sqlite3.OperationalError: pass
    try:
        cursor.execute('ALTER TABLE git_repositories ADD COLUMN sync_strategy TEXT DEFAULT "rebase"')
    except sqlite3.OperationalError: pass
    try:
        cursor.execute('ALTER TABLE git_repositories ADD COLUMN last_auto_sync_at DATETIME')
    except sqlite3.OperationalError: pass
    try:
        cursor.execute('ALTER TABLE git_repositories ADD COLUMN flatten_in_tree BOOLEAN DEFAULT 0')
    except sqlite3.OperationalError: pass

    # Migration: Check if we have existing git config in settings and move it to git_repositories
    cursor.execute("SELECT COUNT(*) FROM git_repositories")
    if cursor.fetchone()[0] == 0:
        cursor.execute("SELECT value FROM settings WHERE key = 'git_url'")
        url_row = cursor.fetchone()
        if url_row and url_row[0]:
            cursor.execute("SELECT value FROM settings WHERE key = 'git_branch'")
            branch_row = cursor.fetchone()
            cursor.execute("SELECT value FROM settings WHERE key = 'git_ssh_private_key'")
            priv_row = cursor.fetchone()
            cursor.execute("SELECT value FROM settings WHERE key = 'git_ssh_public_key'")
            pub_row = cursor.fetchone()

            cursor.execute('''
                INSERT INTO git_repositories (name, slug, url, branch, ssh_private_key, ssh_public_key, is_active)
                VALUES (?, ?, ?, ?, ?, ?, ?)
            ''', ('Default Repo', 'main', url_row[0], branch_row[0] if branch_row else 'master', 
                  priv_row[0] if priv_row else None, pub_row[0] if pub_row else None, 1))
    
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

    # Special handling for ENCRYPTION_SALT to ensure backward compatibility
    cursor.execute('SELECT * FROM settings WHERE key = "ENCRYPTION_SALT"')
    if not cursor.fetchone():
        # Check if we already have an ENCRYPTION_SECRET (existing install)
        cursor.execute('SELECT * FROM settings WHERE key = "ENCRYPTION_SECRET"')
        if cursor.fetchone():
            # Legacy install: use the old static salt to keep existing data decryptable
            legacy_salt = "markflow_static_salt"
            cursor.execute('INSERT INTO settings (key, value) VALUES ("ENCRYPTION_SALT", ?)', (legacy_salt,))
        else:
            # New install: generate a truly random salt
            new_salt = secrets.token_urlsafe(16)
            cursor.execute('INSERT INTO settings (key, value) VALUES ("ENCRYPTION_SALT", ?)', (new_salt,))

    # Migration: Initial settings from JSON to DB if empty
    cursor.execute("SELECT COUNT(*) FROM settings WHERE key = 'app_name'")
    if cursor.fetchone()[0] == 0:
        try:
            example_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), "config_example", "settings.json")
            if os.path.exists(example_path):
                with open(example_path, "r", encoding="utf-8") as f:
                    initial_settings = json.load(f)
                    for k, v in initial_settings.items():
                        # Store dicts/lists as JSON strings
                        val = json.dumps(v) if isinstance(v, (dict, list)) else str(v)
                        cursor.execute('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)', (k, val))
                print(" Initial settings migrated to database.")
        except Exception as e:
            print(f" Warning: Could not migrate initial settings: {e}")
    # Create FTS5 virtual table for documentation search
    try:
        cursor.execute('CREATE VIRTUAL TABLE IF NOT EXISTS fts_docs USING fts5(path, name, content)')
    except sqlite3.OperationalError:
        pass

    # Migration: Encrypt plaintext secrets (ssh_private_key and totp_secret)
    from .db.crypto import encrypt_value
    
    # 1. Encrypt git_repositories secrets
    cursor.execute("SELECT id, ssh_private_key FROM git_repositories WHERE ssh_private_key IS NOT NULL")
    for row in cursor.fetchall():
        repo_id, priv = row
        if priv and not priv.startswith("gAAAA"):
            cursor.execute("UPDATE git_repositories SET ssh_private_key = ? WHERE id = ?", (encrypt_value(priv), repo_id))
            print(f" Migrated SSH key for repository ID {repo_id} to encrypted format.")
            
    # 2. Encrypt users secrets
    cursor.execute("SELECT username, totp_secret FROM users WHERE totp_secret IS NOT NULL")
    for row in cursor.fetchall():
        username, totp = row
        if totp and not totp.startswith("gAAAA"):
            cursor.execute("UPDATE users SET totp_secret = ? WHERE username = ?", (encrypt_value(totp), username))
            print(f" Migrated TOTP secret for user {username} to encrypted format.")

    conn.commit()
    conn.close()
