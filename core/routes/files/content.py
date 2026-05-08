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
        
    with open(full_path, "r", encoding="utf-8") as f:
        content = f.read()
        
    from core.database import get_file_status
    status = get_file_status(path)
    return {"content": content, "public": public, "status": status}

@router.put("/content")
@limiter.limit(SECURITY_LIMITS["file_ops"])
async def save_file_content(path: str, data: FileContent, request: Request, background_tasks: BackgroundTasks, user=Depends(get_developer_user)):
    full_path = get_safe_path(DOCS_DIR, path)
    os.makedirs(os.path.dirname(full_path), exist_ok=True)
    
    image_regex = r'!\[.*?\]\((attachments/.*?)\)'
    old_content = ""
    if os.path.exists(full_path):
        with open(full_path, "r", encoding="utf-8") as f:
            old_content = f.read()
            
    old_images = set(re.findall(image_regex, old_content))
    new_images = set(re.findall(image_regex, data.content))
    orphans = old_images - new_images
    
    if orphans:
        background_tasks.add_task(cleanup_orphaned_images, list(orphans), user["username"])
    
    with open(full_path, "w", encoding="utf-8") as f:
        f.write(data.content)
        
    update_fts_index(path, os.path.basename(path).replace(".md", ""), data.content)
    add_audit_log(user["username"], "file_updated", f"Path: {path}", ip_address=request.client.host)
    return {"message": "File saved"}

def cleanup_orphaned_images(orphans: list, username: str):
    for img_rel_path in orphans:
        if not is_image_referenced(img_rel_path):
            try:
                img_full_path = get_safe_path(DOCS_DIR, img_rel_path)
                if os.path.exists(img_full_path):
                    os.remove(img_full_path)
                    add_audit_log("system", "image_cleanup", f"Deleted orphaned image: {img_rel_path} (after {username} edit)")
            except Exception as e:
                print(f"Failed to cleanup image {img_rel_path}: {e}")
