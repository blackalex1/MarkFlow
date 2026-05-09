import os
import sqlite3
from .base import get_db

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
    safe_query = query_str.replace('"', '""')
    try:
        cursor.execute('''
            SELECT path, name, snippet(fts_docs, 2, '...', '...', '...', 10) as snippet
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
    """Removes files in attachments/ that are not referenced in any document."""
    attachments_dir = os.path.join(docs_dir, 'attachments')
    if not os.path.exists(attachments_dir):
        return

    deleted_count = 0
    for file in os.listdir(attachments_dir):
        rel_path = f"attachments/{file}"
        if not is_image_referenced(rel_path):
            full_path = os.path.join(attachments_dir, file)
            try:
                os.remove(full_path)
                deleted_count += 1
            except Exception as e:
                print(f"Failed to delete orphaned file {rel_path}: {e}")
    
    if deleted_count > 0:
        print(f"Cleaned up {deleted_count} orphaned attachments.")

def is_image_referenced(image_rel_path: str) -> bool:
    """Returns True if the image is referenced in any document's content."""
    conn = get_db()
    cursor = conn.cursor()
    # Normalize path for searching
    search_path = image_rel_path.replace('\\', '/')
    cursor.execute('SELECT 1 FROM fts_docs WHERE content LIKE ? LIMIT 1', (f'%{search_path}%',))
    exists = cursor.fetchone() is not None
    conn.close()
    return exists
