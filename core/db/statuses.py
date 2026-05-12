from .base import get_db

def init_table(cursor):
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS document_statuses (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            slug TEXT UNIQUE NOT NULL,
            name TEXT NOT NULL,
            color TEXT NOT NULL,
            is_system BOOLEAN DEFAULT 0
        )
    ''')

def list_statuses():
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("SELECT id, slug, name, color, is_system FROM document_statuses")
    rows = cursor.fetchall()
    conn.close()
    return [{"id": r[0], "slug": r[1], "name": r[2], "color": r[3], "is_system": bool(r[4])} for r in rows]

def add_status(slug, name, color):
    conn = get_db()
    cursor = conn.cursor()
    try:
        cursor.execute("INSERT INTO document_statuses (slug, name, color) VALUES (?, ?, ?)", (slug, name, color))
        conn.commit()
        return True
    except:
        return False
    finally:
        conn.close()

def update_status(status_id, name, color):
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("UPDATE document_statuses SET name = ?, color = ? WHERE id = ? AND is_system = 0", (name, color, status_id))
    # Note: we only allow editing name/color for non-system or we could allow color for system too?
    # Let's allow color editing for system statuses too, but not name/slug
    cursor.execute("UPDATE document_statuses SET color = ? WHERE id = ?", (color, status_id))
    cursor.execute("UPDATE document_statuses SET name = ? WHERE id = ? AND is_system = 0", (name, status_id))
    conn.commit()
    conn.close()

def delete_status(status_id):
    conn = get_db()
    cursor = conn.cursor()
    # Don't delete system statuses
    cursor.execute("DELETE FROM document_statuses WHERE id = ? AND is_system = 0", (status_id,))
    conn.commit()
    conn.close()

def get_status_by_slug(slug):
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("SELECT id, slug, name, color FROM document_statuses WHERE slug = ?", (slug,))
    row = cursor.fetchone()
    conn.close()
    if row:
        return {"id": row[0], "slug": row[1], "name": row[2], "color": row[3]}
    return None
