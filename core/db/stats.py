import sqlite3
from datetime import date
from .base import db_session

def init_table(cursor):
    # Daily site-wide stats
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS daily_stats (
            date TEXT PRIMARY KEY,
            visits INTEGER DEFAULT 0,
            views INTEGER DEFAULT 0
        )
    ''')
    
    # Per-document stats
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS document_stats (
            path TEXT PRIMARY KEY,
            views INTEGER DEFAULT 0,
            last_viewed TEXT
        )
    ''')

    # Tracking for uniqueness (Deduplication)
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS stats_unique_hits (
            hit_type TEXT, -- 'visit' or 'view'
            tracking_id TEXT, -- session_id or IP
            path TEXT, -- file path for views, '' for visits
            hit_date TEXT,
            PRIMARY KEY (hit_type, tracking_id, path, hit_date)
        )
    ''')

def log_visit(tracking_id: str):
    """Logs a site visit with deduplication by tracking_id per day."""
    today = date.today().isoformat()
    with db_session() as conn:
        # Check if already visited today
        cursor = conn.cursor()
        cursor.execute('''
            SELECT 1 FROM stats_unique_hits 
            WHERE hit_type = 'visit' AND tracking_id = ? AND hit_date = ?
        ''', (tracking_id, today))
        
        if not cursor.fetchone():
            try:
                conn.execute('''
                    INSERT OR IGNORE INTO stats_unique_hits (hit_type, tracking_id, path, hit_date)
                    VALUES ('visit', ?, '', ?)
                ''', (tracking_id, today))
                
                conn.execute('''
                    INSERT INTO daily_stats (date, visits) VALUES (?, 1)
                    ON CONFLICT(date) DO UPDATE SET visits = visits + 1
                ''', (today,))
            except sqlite3.Error:
                pass # Already handled by IGNORE or race condition

def log_view(path: str, tracking_id: str):
    """Logs a document view with deduplication by tracking_id per day."""
    today = date.today().isoformat()
    with db_session() as conn:
        # Check if already viewed this path today
        cursor = conn.cursor()
        cursor.execute('''
            SELECT 1 FROM stats_unique_hits 
            WHERE hit_type = 'view' AND tracking_id = ? AND path = ? AND hit_date = ?
        ''', (tracking_id, path, today))
        
        if not cursor.fetchone():
            try:
                conn.execute('''
                    INSERT OR IGNORE INTO stats_unique_hits (hit_type, tracking_id, path, hit_date)
                    VALUES ('view', ?, ?, ?)
                ''', (tracking_id, path, today))
                
                # Update daily views
                conn.execute('''
                    INSERT INTO daily_stats (date, views) VALUES (?, 1)
                    ON CONFLICT(date) DO UPDATE SET views = views + 1
                ''', (today,))
                
                # Update document views
                conn.execute('''
                    INSERT INTO document_stats (path, views, last_viewed) VALUES (?, 1, ?)
                    ON CONFLICT(path) DO UPDATE SET views = views + 1, last_viewed = ?
                ''', (path, today, today))
            except sqlite3.Error:
                pass

def get_site_stats(days: int = 30):
    with db_session() as conn:
        cursor = conn.cursor()
        cursor.execute('''
            SELECT * FROM daily_stats 
            ORDER BY date DESC LIMIT ?
        ''', (days,))
        return [dict(row) for row in cursor.fetchall()]

def get_top_documents(limit: int = 10):
    with db_session() as conn:
        cursor = conn.cursor()
        cursor.execute('''
            SELECT * FROM document_stats 
            ORDER BY views DESC LIMIT ?
        ''', (limit,))
        return [dict(row) for row in cursor.fetchall()]

def get_document_stats(path: str):
    with db_session() as conn:
        cursor = conn.cursor()
        cursor.execute('SELECT views FROM document_stats WHERE path = ?', (path,))
        row = cursor.fetchone()
        return dict(row) if row else {"views": 0}
