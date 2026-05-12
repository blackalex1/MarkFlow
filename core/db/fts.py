import os
import sqlite3
import sqlite3
from .base import get_db

def init_table(cursor):
    try:
        cursor.execute('CREATE VIRTUAL TABLE IF NOT EXISTS fts_docs USING fts5(path, name, content)')
    except sqlite3.OperationalError:
        pass

def update_fts_index(path: str, name: str, content: str):
    conn = get_db()
    cursor = conn.cursor()
    # FTS5 doesn't support UNIQUE constraints, so we delete first to "replace"
    cursor.execute('DELETE FROM fts_docs WHERE path = ?', (path,))
    cursor.execute('INSERT INTO fts_docs (path, name, content) VALUES (?, ?, ?)', (path, name, content))
    conn.commit()
    conn.close()

def delete_fts_index(path: str):
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute('DELETE FROM fts_docs WHERE path = ?', (path,))
    conn.commit()
    conn.close()

def search_fts(query_str: str, limit: int = 20):
    conn = get_db()
    cursor = conn.cursor()
    # Using bm25 ranking and snippet function for results
    # We escape double quotes in query to prevent syntax errors
    # We use <mark> tags for highlighting
    safe_query = query_str.replace('"', '""')
    try:
        # SQLite FTS5 rank is lower for better matches (BM25)
        # snippet(table, column, start, end, ellipsis, tokens)
        cursor.execute('''
            SELECT path, name, snippet(fts_docs, 2, '<mark>', '</mark>', '...', 15) as snippet, rank
            FROM fts_docs 
            WHERE fts_docs MATCH ? 
            ORDER BY rank 
            LIMIT ?
        ''', (f'"{safe_query}"*', limit))
        rows = cursor.fetchall()
    except sqlite3.OperationalError:
        # Fallback if query syntax is wrong or MATCH fails
        return []
    finally:
        conn.close()
    return [dict(row) for row in rows]

def reindex_all_docs(docs_dir: str):
    """Clears and rebuilds the entire search index and cleans up orphaned attachments."""
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute('DELETE FROM fts_docs')
    
    # 1. Rebuild Index
    for root, dirs, files in os.walk(docs_dir):
        for file in files:
            if file.endswith('.md'):
                full_path = os.path.join(root, file)
                rel_path = os.path.relpath(full_path, docs_dir).replace('\\', '/')
                name = file.replace('.md', '')
                try:
                    with open(full_path, 'r', encoding='utf-8', errors='replace') as f:
                        content = f.read()
                    cursor.execute('INSERT INTO fts_docs (path, name, content) VALUES (?, ?, ?)', (rel_path, name, content))
                except Exception as e:
                    print(f"Failed to index {rel_path}: {e}")
    
    conn.commit()
    conn.close()
    
    # 2. Cleanup orphaned attachments
    cleanup_orphaned_attachments(docs_dir)

def cleanup_orphaned_attachments(docs_dir: str):
    """Removes files in any 'attachments' folder that are not referenced in any document."""
    found_folders = []
    for root, dirs, files in os.walk(docs_dir):
        if 'attachments' in dirs:
            found_folders.append(os.path.join(root, 'attachments'))

    deleted_count = 0
    for attachments_dir in found_folders:
        # Get path relative to docs_dir to reconstruct the reference string
        base_rel_path = os.path.relpath(attachments_dir, docs_dir).replace('\\', '/')
        
        for file in os.listdir(attachments_dir):
            # We check if 'attachments/filename' part is referenced anywhere
            # This is safe because our filenames are unique hashes
            ref_path = f"attachments/{file}"
            
            # For the actual file check, we need the path relative to DOCS_DIR
            full_rel_path = f"{base_rel_path}/{file}".replace('//', '/')
            
            if not is_image_referenced(ref_path):
                full_path = os.path.join(attachments_dir, file)
                try:
                    os.remove(full_path)
                    deleted_count += 1
                except Exception as e:
                    print(f"Failed to delete orphaned file {full_rel_path}: {e}")
    
    if deleted_count > 0:
        print(f"Cleaned up {deleted_count} orphaned attachments.")

def is_image_referenced(image_ref_part: str) -> bool:
    """
    Returns True if the image reference part (e.g. 'attachments/hash.png') 
    is found in any document's content.
    """
    conn = get_db()
    cursor = conn.cursor()
    # We search for the 'attachments/filename' part which is common to all relative/absolute links
    search_str = image_ref_part.replace('\\', '/')
    if not search_str.startswith('attachments/'):
        # If it's a full path like 'repo/attachments/file.png', extract the end part
        if 'attachments/' in search_str:
            search_str = 'attachments/' + search_str.split('attachments/')[-1]

    cursor.execute('SELECT 1 FROM fts_docs WHERE content LIKE ? LIMIT 1', (f'%{search_str}%',))
    exists = cursor.fetchone() is not None
    conn.close()
    return exists
