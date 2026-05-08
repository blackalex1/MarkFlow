from .base import get_db

def list_repositories():
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute('SELECT * FROM git_repositories ORDER BY id DESC')
    rows = cursor.fetchall()
    conn.close()
    return [dict(row) for row in rows]

def get_active_repository():
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute('SELECT * FROM git_repositories WHERE is_active = 1 LIMIT 1')
    row = cursor.fetchone()
    conn.close()
    return dict(row) if row else None

def get_repository(repo_id: int):
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute('SELECT * FROM git_repositories WHERE id = ?', (repo_id,))
    row = cursor.fetchone()
    conn.close()
    return dict(row) if row else None

def add_repository(name: str, slug: str, url: str, branch: str = 'master', priv: str = None, pub: str = None):
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute('''
        INSERT INTO git_repositories (name, slug, url, branch, ssh_private_key, ssh_public_key, is_active)
        VALUES (?, ?, ?, ?, ?, ?, 0)
    ''', (name, slug, url, branch, priv, pub))
    new_id = cursor.lastrowid
    conn.commit()
    conn.close()
    return new_id

def update_repository(repo_id: int, name: str, slug: str, url: str, branch: str, priv: str = None, pub: str = None):
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute('''
        UPDATE git_repositories 
        SET name = ?, slug = ?, url = ?, branch = ?, ssh_private_key = ?, ssh_public_key = ?
        WHERE id = ?
    ''', (name, slug, url, branch, priv, pub, repo_id))
    conn.commit()
    conn.close()

def delete_repository(repo_id: int):
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute('DELETE FROM git_repositories WHERE id = ?', (repo_id,))
    conn.commit()
    conn.close()

def set_active_repository(repo_id: int):
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute('UPDATE git_repositories SET is_active = 0')
    cursor.execute('UPDATE git_repositories SET is_active = 1 WHERE id = ?', (repo_id,))
    conn.commit()
    conn.close()
