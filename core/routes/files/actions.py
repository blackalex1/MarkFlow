import os
import shutil
from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel
from core.config import limiter
from core.security_config import SECURITY_LIMITS
from core.database import (
    update_fts_index, delete_fts_index, add_audit_log, 
    set_public, rename_metadata, reindex_all_docs
)
from core.auth import get_developer_user, get_maintainer_user
from core.config import DOCS_DIR
from .utils import get_safe_path

router = APIRouter()

class FileVisibility(BaseModel):
    public: bool

class MoveRequest(BaseModel):
    old_path: str
    new_path: str

@router.put("/visibility")
@limiter.limit(SECURITY_LIMITS["file_ops"])
def set_file_visibility(request: Request, path: str, data: FileVisibility, user=Depends(get_maintainer_user)):
    get_safe_path(DOCS_DIR, path)
    set_public(path, data.public)
    add_audit_log(user["username"], "visibility_changed", f"Path: {path}, Public: {data.public}")
    return {"message": f"Visibility updated to {'public' if data.public else 'private'}"}

@router.post("/create")
@limiter.limit(SECURITY_LIMITS["file_ops"])
def create_file(request: Request, path: str, user=Depends(get_developer_user)):
    if not path.endswith(".md"):
        path += ".md"
        
    full_path = get_safe_path(DOCS_DIR, path)
    if os.path.exists(full_path):
        raise HTTPException(status_code=400, detail="File already exists")
        
    os.makedirs(os.path.dirname(full_path), exist_ok=True)
    
    with open(full_path, "w", encoding="utf-8") as f:
        content = f"# {os.path.basename(path).replace('.md', '')}\n\nNew file..."
        f.write(content)
        
    update_fts_index(path, os.path.basename(path).replace(".md", ""), content)
    set_public(path, False)
    add_audit_log(user["username"], "file_created", f"Path: {path}")
    return {"message": "File created", "path": path}

@router.post("/mkdir")
@limiter.limit(SECURITY_LIMITS["file_ops"])
def create_folder(request: Request, path: str, user=Depends(get_developer_user)):
    full_path = get_safe_path(DOCS_DIR, path)
    if os.path.exists(full_path):
        raise HTTPException(status_code=400, detail="Path already exists")
    os.makedirs(full_path, exist_ok=True)
    add_audit_log(user["username"], "folder_created", f"Path: {path}")
    return {"message": "Folder created", "path": path}

@router.post("/move")
@limiter.limit(SECURITY_LIMITS["file_ops"])
def move_file(request: Request, data: MoveRequest, user=Depends(get_developer_user)):
    old_full_path = get_safe_path(DOCS_DIR, data.old_path)
    new_full_path = get_safe_path(DOCS_DIR, data.new_path)
    
    if not os.path.exists(old_full_path):
        raise HTTPException(status_code=404, detail="Source not found")
    if os.path.exists(new_full_path):
        raise HTTPException(status_code=400, detail="Destination already exists")
        
    os.makedirs(os.path.dirname(new_full_path), exist_ok=True)
    shutil.move(old_full_path, new_full_path)
    rename_metadata(data.old_path, data.new_path)
    
    if data.new_path.endswith('.md'):
        delete_fts_index(data.old_path)
        with open(new_full_path, "r", encoding="utf-8") as f:
            content = f.read()
            update_fts_index(data.new_path, os.path.basename(data.new_path).replace(".md", ""), content)
    
    add_audit_log(user["username"], "file_moved", f"From: {data.old_path}, To: {data.new_path}")
    return {"message": "File moved successfully"}

@router.post("/reindex")
def manual_reindex(user=Depends(get_maintainer_user)):
    reindex_all_docs(DOCS_DIR)
    add_audit_log(user["username"], "manual_reindex")
    return {"message": "Reindexing complete"}

@router.delete("/delete")
@limiter.limit(SECURITY_LIMITS["file_ops"])
def delete_file(request: Request, path: str, user=Depends(get_maintainer_user)):
    full_path = get_safe_path(DOCS_DIR, path)
    if not os.path.exists(full_path):
        raise HTTPException(status_code=404, detail="File not found")
    
    add_audit_log(user["username"], "file_deleted", f"Path: {path}")
    
    if os.path.isdir(full_path):
        shutil.rmtree(full_path)
    else:
        os.remove(full_path)
        delete_fts_index(path)
        
    return {"message": "File deleted"}
