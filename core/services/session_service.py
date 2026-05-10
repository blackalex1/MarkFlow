import asyncio
from datetime import datetime
from core.db.base import db_session

async def cleanup_expired_sessions():
    """Background task that periodically removes expired sessions from the database."""
    print("Session cleanup worker starting...")
    while True:
        try:
            with db_session() as conn:
                cursor = conn.cursor()
                cursor.execute("DELETE FROM sessions WHERE expires_at < ?", (datetime.now().isoformat(),))
                deleted = cursor.rowcount
                if deleted > 0:
                    print(f"Cleaned up {deleted} expired sessions.")
        except Exception as e:
            print(f"Session cleanup error: {e}")
            
        # Run every hour
        await asyncio.sleep(3600)

def clean_old_user_sessions(username: str, keep_latest: int = 5):
    """
    Removes old sessions for a user, keeping only the most recent ones.
    Useful to prevent session accumulation.
    """
    try:
        with db_session() as conn:
            cursor = conn.cursor()
            # Find sessions to delete
            cursor.execute('''
                DELETE FROM sessions 
                WHERE username = ? AND id NOT IN (
                    SELECT id FROM sessions 
                    WHERE username = ? 
                    ORDER BY expires_at DESC 
                    LIMIT ?
                )
            ''', (username, username, keep_latest))
    except Exception as e:
        print(f"Error cleaning old sessions for {username}: {e}")
