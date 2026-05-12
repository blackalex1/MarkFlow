import sqlite3
from .base import db_session, get_db
from .crypto import encrypt_value, decrypt_value

def init_table(cursor):
    # Git Repositories
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

    # Migrations
    try:
        cursor.execute('ALTER TABLE git_repositories ADD COLUMN slug TEXT')
        cursor.execute('UPDATE git_repositories SET slug = "repo_" || id WHERE slug IS NULL')
    except sqlite3.OperationalError: pass
    try: cursor.execute('ALTER TABLE git_repositories ADD COLUMN last_sync_status TEXT')
    except sqlite3.OperationalError: pass
    try: cursor.execute('ALTER TABLE git_repositories ADD COLUMN last_sync_error TEXT')
    except sqlite3.OperationalError: pass
    try: cursor.execute('ALTER TABLE git_repositories ADD COLUMN last_sync_at DATETIME')
    except sqlite3.OperationalError: pass
    try: cursor.execute('ALTER TABLE git_repositories ADD COLUMN auto_sync_interval INTEGER DEFAULT 0')
    except sqlite3.OperationalError: pass
    try: cursor.execute('ALTER TABLE git_repositories ADD COLUMN sync_strategy TEXT DEFAULT "rebase"')
    except sqlite3.OperationalError: pass
    try: cursor.execute('ALTER TABLE git_repositories ADD COLUMN last_auto_sync_at DATETIME')
    except sqlite3.OperationalError: pass
    try: cursor.execute('ALTER TABLE git_repositories ADD COLUMN flatten_in_tree BOOLEAN DEFAULT 0')
    except sqlite3.OperationalError: pass

def list_repositories(include_secrets: bool = False):
    with db_session() as conn:
        cursor = conn.cursor()
        cursor.execute('SELECT * FROM git_repositories ORDER BY id DESC')
        rows = cursor.fetchall()
        repos = []
        for row in rows:
            r = dict(row)
            if r.get("ssh_private_key"):
                if include_secrets:
                    r["ssh_private_key"] = decrypt_value(r["ssh_private_key"])
                else:
                    r["ssh_private_key"] = None # Exclude from list
            repos.append(r)
        return repos

def get_active_repository(include_secrets: bool = False):
    with db_session() as conn:
        cursor = conn.cursor()
        cursor.execute('SELECT * FROM git_repositories WHERE is_active = 1 LIMIT 1')
        row = cursor.fetchone()
        if row:
            r = dict(row)
            if r.get("ssh_private_key"):
                if include_secrets:
                    r["ssh_private_key"] = decrypt_value(r["ssh_private_key"])
                else:
                    r["ssh_private_key"] = None
            return r
        return None

def get_repository(repo_id: int, include_secrets: bool = False):
    with db_session() as conn:
        cursor = conn.cursor()
        cursor.execute('SELECT * FROM git_repositories WHERE id = ?', (repo_id,))
        row = cursor.fetchone()
        if row:
            r = dict(row)
            if r.get("ssh_private_key"):
                if include_secrets:
                    r["ssh_private_key"] = decrypt_value(r["ssh_private_key"])
                else:
                    r["ssh_private_key"] = None
            return r
        return None

def add_repository(name: str, slug: str, url: str, branch: str = 'master', priv: str = None, pub: str = None, interval: int = 0, strategy: str = 'rebase', flatten: bool = False):
    with db_session() as conn:
        cursor = conn.cursor()
        cursor.execute('''
            INSERT INTO git_repositories (name, slug, url, branch, ssh_private_key, ssh_public_key, is_active, auto_sync_interval, sync_strategy, flatten_in_tree)
            VALUES (?, ?, ?, ?, ?, ?, 0, ?, ?, ?)
        ''', (name, slug, url, branch, encrypt_value(priv), pub, interval, strategy, 1 if flatten else 0))
        return cursor.lastrowid

def update_repository(repo_id: int, name: str, slug: str, url: str, branch: str, priv: str = None, pub: str = None, interval: int = 0, strategy: str = 'rebase', flatten: bool = False):
    with db_session() as conn:
        cursor = conn.cursor()
        
        # If pub is explicitly empty/None, we clear both keys
        if pub is None or pub == "":
            cursor.execute('''
                UPDATE git_repositories 
                SET name = ?, slug = ?, url = ?, branch = ?, 
                    ssh_private_key = NULL, ssh_public_key = NULL,
                    auto_sync_interval = ?, sync_strategy = ?, flatten_in_tree = ?
                WHERE id = ?
            ''', (name, slug, url, branch, interval, strategy, 1 if flatten else 0, repo_id))
        else:
            # If we have a new public key, we update both (if priv is provided) or just public
            # However, usually they come in pairs. If priv is None, keep old priv.
            cursor.execute('''
                UPDATE git_repositories 
                SET name = ?, slug = ?, url = ?, branch = ?, 
                    ssh_private_key = COALESCE(?, ssh_private_key), 
                    ssh_public_key = ?, 
                    auto_sync_interval = ?, sync_strategy = ?, flatten_in_tree = ?
                WHERE id = ?
            ''', (name, slug, url, branch, encrypt_value(priv) if priv else None, pub, interval, strategy, 1 if flatten else 0, repo_id))

def delete_repository(repo_id: int):
    with db_session() as conn:
        cursor = conn.cursor()
        cursor.execute('DELETE FROM git_repositories WHERE id = ?', (repo_id,))

def set_active_repository(repo_id: int):
    with db_session() as conn:
        cursor = conn.cursor()
        cursor.execute('UPDATE git_repositories SET is_active = 0')
        cursor.execute('UPDATE git_repositories SET is_active = 1 WHERE id = ?', (repo_id,))
