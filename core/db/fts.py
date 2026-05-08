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
    """Clears and rebuilds the entire search index by crawling the docs directory."""
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute('DELETE FROM fts_docs')
    
    for root, dirs, files in os.walk(docs_dir):
        for file in files:
            if file.endswith('.md'):
                full_path = os.path.join(root, file)
                # Use forward slashes for cross-platform consistency in the DB
                rel_path = os.path.relpath(full_path, docs_dir).replace('\\', '/')
                name = file.replace('.md', '')
                try:
                    # Try UTF-8 first
                    with open(full_path, 'r', encoding='utf-8') as f:
                        content = f.read()
                except UnicodeDecodeError:
                    try:
                        # Fallback to UTF-16 (common on Windows)
                        with open(full_path, 'r', encoding='utf-16') as f:
                            content = f.read()
                    except Exception:
                        # Final fallback with replacement characters
                        with open(full_path, 'r', encoding='utf-8', errors='replace') as f:
                            content = f.read()
                
                try:
                    cursor.execute('INSERT INTO fts_docs (path, name, content) VALUES (?, ?, ?)', (rel_path, name, content))
                except Exception as e:
                    print(f"Failed to index content for {rel_path}: {e}")
    
    conn.commit()
    conn.close()

def is_image_referenced(image_rel_path: str) -> bool:
    """Returns True if the image is referenced in any document's content."""
    conn = get_db()
    cursor = conn.cursor()
    # We use LIKE for a robust substring search in the original content
    # Since FTS table stores the content, we can query it
    cursor.execute('SELECT 1 FROM fts_docs WHERE content LIKE ? LIMIT 1', (f'%{image_rel_path}%',))
    exists = cursor.fetchone() is not None
    conn.close()
    return exists
