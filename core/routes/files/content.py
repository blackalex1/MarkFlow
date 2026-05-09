import os
import re
from fastapi import APIRouter, Depends, HTTPException, Request, BackgroundTasks
from pydantic import BaseModel
from core.database import (
    update_fts_index, add_audit_log, is_public, is_image_referenced
)
from core.auth import get_current_user, get_developer_user, ROLES
from core.config import DOCS_DIR, limiter, SECURITY_LIMITS
from .utils import get_safe_path

router = APIRouter()

class FileContent(BaseModel):
    content: str


@router.get("/content")
@limiter.limit(SECURITY_LIMITS["file_ops"])
def get_file_content(path: str, request: Request):
    user = get_current_user(request)
    user_role = user.get("role", "guest") if user else "guest"
    can_see_private = ROLES.get(user_role, 0) >= ROLES.get("reporter", 0)
    
    full_path = get_safe_path(DOCS_DIR, path)
        
    public = is_public(path)
    if not public and not can_see_private:
        raise HTTPException(status_code=403, detail="Access denied")
        
    if os.path.isdir(full_path):
        return {"is_folder": True}
        
    if not os.path.exists(full_path):
        raise HTTPException(status_code=404, detail="File not found")
        
    if path.lower().endswith((".png", ".jpg", ".jpeg", ".gif", ".svg", ".webp", ".mp4", ".webm", ".ogg")):
        from fastapi.responses import FileResponse
        return FileResponse(full_path)
        
    try:
        with open(full_path, "r", encoding="utf-8") as f:
            content = f.read()
    except UnicodeDecodeError:
        try:
            with open(full_path, "r", encoding="utf-16") as f:
                content = f.read()
        except Exception:
            with open(full_path, "r", encoding="utf-8", errors="replace") as f:
                content = f.read()
        
    from core.database import get_file_status
    status = get_file_status(path)
    return {"content": content, "public": public, "status": status}
    
@router.put("/content")
@limiter.limit(SECURITY_LIMITS["file_ops"])
async def save_file_content(path: str, data: FileContent, request: Request, background_tasks: BackgroundTasks, user=Depends(get_developer_user)):
    """Saves file content and handles image cleanup."""
    full_path = get_safe_path(DOCS_DIR, path)
    
    # Security: Ensure we don't write outside DOCS_DIR
    if not full_path.startswith(os.path.abspath(DOCS_DIR)):
         raise HTTPException(status_code=403, detail="Illegal path")

    os.makedirs(os.path.dirname(full_path), exist_ok=True)
    
    # Regex to find attachments in Markdown and HTML (images and videos)
    # Matches any path containing 'attachments/'
    attachment_regex = r'(?:!\[.*?\]\(|src=["\'])([^"\s\)]*?attachments/[^"\s\)]+)'
    old_content = ""
    if os.path.exists(full_path):
        try:
            with open(full_path, "r", encoding="utf-8") as f:
                old_content = f.read()
        except Exception:
            old_content = ""
            
    old_attachments = set(re.findall(attachment_regex, old_content))
    new_attachments = set(re.findall(attachment_regex, data.content))
    orphans = old_attachments - new_attachments
    
    if orphans:
        doc_dir = os.path.dirname(path)
        background_tasks.add_task(cleanup_orphaned_attachments, list(orphans), doc_dir, user["username"])
    
    with open(full_path, "w", encoding="utf-8") as f:
        f.write(data.content)
        
    update_fts_index(path, os.path.basename(path).replace(".md", ""), data.content)
    add_audit_log(user["username"], "file_updated", f"Path: {path}", ip_address=request.client.host)
    return {"message": "File saved"}

def cleanup_orphaned_attachments(orphans: list, doc_dir: str, username: str):
    for att_path in orphans:
        if not is_image_referenced(att_path):
            try:
                # Resolve relative path if necessary
                if att_path.startswith('.'):
                    rel_to_root = os.path.normpath(os.path.join(doc_dir, att_path)).replace('\\', '/')
                else:
                    rel_to_root = att_path
                
                att_full_path = get_safe_path(DOCS_DIR, rel_to_root)
                if os.path.exists(att_full_path):
                    os.remove(att_full_path)
                    add_audit_log("system", "attachment_cleanup", f"Deleted orphaned attachment: {rel_to_root} (after {username} edit)")
            except Exception as e:
                print(f"Failed to cleanup attachment {att_path}: {e}")

