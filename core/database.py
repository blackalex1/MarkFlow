import os
import json
import secrets
import string
import sqlite3
from .db.base import get_db, pwd_context, DB_PATH
from .db.users import (
    init_table as init_users, get_user_by_username, set_user_totp_secret, 
    list_users, create_user, delete_user, update_user_role, 
    update_user_password, verify_password
)
from .db.sessions import init_table as init_sessions, create_session, get_session, delete_session, clear_user_sessions
from .db.settings import init_table as init_settings, get_setting, set_setting
from .db.repos import (
    init_table as init_repos, list_repositories, get_active_repository, 
    get_repository, add_repository, update_repository, delete_repository, 
    set_active_repository
)
from .db.audit import init_table as init_audit, add_audit_log, get_audit_logs
from .db.fts import init_table as init_fts, update_fts_index, delete_fts_index, search_fts, reindex_all_docs, is_image_referenced, reindex_incremental
from .db.statuses import init_table as init_statuses, list_statuses, add_status, update_status, delete_status, get_status_by_slug
from .db.stats import init_table as init_stats, log_visit, log_view, get_site_stats, get_top_documents
from .metadata import is_public, set_public, set_public_recursive, get_file_status, set_file_status, rename_metadata
from .db.crypto import encrypt_value

def init_db():
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("PRAGMA journal_mode=WAL")
    
    # 1. Initialize all tables
    init_users(cursor)
    init_settings(cursor)
    init_audit(cursor)
    init_sessions(cursor)
    init_repos(cursor)
    init_statuses(cursor)
    init_fts(cursor)
    init_stats(cursor)
    
    # 2. Seed default statuses
    cursor.execute("SELECT COUNT(*) FROM document_statuses")
    if cursor.fetchone()[0] == 0:
        default_statuses = [
            ('draft', 'Draft', '#94a3b8', 1),
            ('in_progress', 'In Progress', '#6366f1', 1),
            ('published', 'Published', '#22c55e', 1)
        ]
        cursor.executemany('INSERT INTO document_statuses (slug, name, color, is_system) VALUES (?, ?, ?, ?)', default_statuses)

    # 3. Ensure admin exists
    cursor.execute('SELECT * FROM users WHERE username = ?', ('admin',))
    if not cursor.fetchone():
        alphabet = string.ascii_letters + string.digits
        password = ''.join(secrets.choice(alphabet) for _ in range(12))
        cursor.execute('INSERT INTO users (username, password_hash, is_admin, role) VALUES (?, ?, ?, ?)', 
                       ('admin', pwd_context.hash(password), True, 'owner'))
        print("\n" + "="*60 + f"\nADMIN CREATED\nUser: admin\nPass: {password}\n" + "="*60 + "\n")
    else:
        cursor.execute('UPDATE users SET role = ? WHERE username = ?', ('owner', 'admin'))
    
    # 4. Generate system secrets
    for key in ['SESSION_SECRET', 'RECOVERY_SECRET', 'ENCRYPTION_SECRET']:
        cursor.execute('SELECT * FROM settings WHERE key = ?', (key,))
        if not cursor.fetchone():
            cursor.execute('INSERT INTO settings (key, value) VALUES (?, ?)', (key, secrets.token_urlsafe(32)))

    # 5. Encryption Salt (Legacy compatibility)
    cursor.execute('SELECT * FROM settings WHERE key = "ENCRYPTION_SALT"')
    if not cursor.fetchone():
        cursor.execute('SELECT * FROM settings WHERE key = "ENCRYPTION_SECRET"')
        salt = "markflow_static_salt" if cursor.fetchone() else secrets.token_urlsafe(16)
        cursor.execute('INSERT INTO settings (key, value) VALUES ("ENCRYPTION_SALT", ?)', (salt,))

    # 6. Global SSH key
    cursor.execute("SELECT value FROM settings WHERE key = 'git_ssh_private_key'")
    if not cursor.fetchone():
        try:
            from core.services.ssh_service import generate_key_pair
            priv, pub = generate_key_pair()
            cursor.execute("INSERT OR REPLACE INTO settings (key, value) VALUES ('git_ssh_private_key', ?)", (encrypt_value(priv),))
            cursor.execute("INSERT OR REPLACE INTO settings (key, value) VALUES ('git_ssh_public_key', ?)", (pub,))
        except Exception as e: print(f"SSH generation failed: {e}")

    conn.commit()
    conn.close()
