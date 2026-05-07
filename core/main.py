import os
from fastapi import FastAPI, Depends, HTTPException, Request, Response
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
from pydantic import BaseModel
from typing import List, Optional

from core.database import init_db, update_fts_index, delete_fts_index, search_fts, add_audit_log
from core.auth import (
    router as auth_router, get_current_user, get_admin_user, 
    get_reporter_user, get_developer_user, get_maintainer_user, get_owner_user
)
from core.git_sync import router as git_router
from core.metadata import is_public, set_public

from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.util import get_remote_address
from slowapi.errors import RateLimitExceeded

limiter = Limiter(key_func=get_remote_address)

from contextlib import asynccontextmanager

@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db()
    reindex_all_docs()
    yield

def reindex_all_docs():
    """Builds the search index from scratch on startup."""
    print("--- Reindexing documentation ---")
    if not os.path.exists(DOCS_DIR):
        os.makedirs(DOCS_DIR)
        
    for root, dirs, files in os.walk(DOCS_DIR):
        for file in files:
            if not file.endswith(".md"):
                continue
            rel_path = os.path.relpath(os.path.join(root, file), DOCS_DIR).replace('\\', '/')
            try:
                with open(os.path.join(root, file), "r", encoding="utf-8") as f:
                    content = f.read()
                    update_fts_index(rel_path, file.replace(".md", ""), content)
            except Exception as e:
                print(f"Error indexing {file}: {e}")
    print("--- Reindexing complete ---")

app = FastAPI(title="Notion-like Docs", lifespan=lifespan)
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

# Routers
app.include_router(auth_router, prefix="/api/auth", tags=["auth"])
app.include_router(git_router, prefix="/api/git", tags=["git"])

# Static and Templates
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DOCS_DIR = os.path.join(os.path.dirname(BASE_DIR), "markdown_docs")

# Ensure static and templates directories exist
os.makedirs(os.path.join(BASE_DIR, "static", "css"), exist_ok=True)
os.makedirs(os.path.join(BASE_DIR, "static", "js"), exist_ok=True)
os.makedirs(os.path.join(BASE_DIR, "templates"), exist_ok=True)

app.mount("/static", StaticFiles(directory=os.path.join(BASE_DIR, "static")), name="static")
templates = Jinja2Templates(directory=os.path.join(BASE_DIR, "templates"))

class FileContent(BaseModel):
    content: str

class FileVisibility(BaseModel):
    public: bool

@app.get("/")
def read_root(request: Request):
    return templates.TemplateResponse(request=request, name="index.html")

def get_safe_path(base_dir: str, user_path: str) -> str:
    """Safely join paths to prevent Directory Traversal attacks."""
    # os.path.abspath resolves .. and . automatically
    full_path = os.path.abspath(os.path.join(base_dir, user_path))
    expected_base = os.path.abspath(base_dir)
    # Check if the resolved path starts exactly with the base directory
    if not full_path.startswith(expected_base + os.sep) and full_path != expected_base:
        raise HTTPException(status_code=400, detail="Invalid path: Traversal detected")
    return full_path

# API for Files
@app.get("/api/files/tree")
def get_file_tree(request: Request):
    user = get_current_user(request)
    # Reporter can see private files in the tree
    from core.auth import ROLES
    user_role = user.get("role", "guest") if user else "guest"
    can_see_private = ROLES.get(user_role, 0) >= ROLES.get("reporter", 0)
    is_staff = ROLES.get(user_role, 0) >= ROLES.get("maintainer", 0)
    
    if not os.path.exists(DOCS_DIR):
        os.makedirs(DOCS_DIR)
        
    def build_tree(path):
        nodes = []
        try:
            items = os.listdir(path)
        except OSError:
            return nodes
            
        # Sort items: folders first, then files
        items.sort(key=lambda x: (not os.path.isdir(os.path.join(path, x)), x.lower()))
        
        for item in items:
            if item.startswith('.'): continue
            
            full_path = os.path.join(path, item)
            rel_path = os.path.relpath(full_path, DOCS_DIR).replace('\\', '/')
            
            if os.path.isdir(full_path):
                children = build_tree(full_path)
                if children or is_staff: # Show empty folders to staff
                    nodes.append({
                        "name": item,
                        "type": "folder",
                        "children": children
                    })
            elif item.endswith(".md"):
                public = is_public(rel_path)
                if public or can_see_private:
                    nodes.append({
                        "name": item,
                        "type": "file",
                        "path": rel_path,
                        "public": public
                    })
        return nodes

    return {"tree": build_tree(DOCS_DIR)}

@app.get("/api/files/content")
def get_file_content(path: str, request: Request):
    user = get_current_user(request)
    from core.auth import ROLES
    user_role = user.get("role", "guest") if user else "guest"
    can_see_private = ROLES.get(user_role, 0) >= ROLES.get("reporter", 0)
    
    # Path traversal protection
    full_path = get_safe_path(DOCS_DIR, path)
        
    public = is_public(path)
    if not public and not can_see_private:
        raise HTTPException(status_code=403, detail="Access denied")
        
    if not os.path.exists(full_path):
        raise HTTPException(status_code=404, detail="File not found")
        
    # If it's an image, return FileResponse directly
    if path.lower().endswith((".png", ".jpg", ".jpeg", ".gif", ".svg", ".webp")):
        from fastapi.responses import FileResponse
        return FileResponse(full_path)
        
    with open(full_path, "r", encoding="utf-8") as f:
        content = f.read()
        
    return {"content": content, "public": public}

@app.put("/api/files/content")
def save_file_content(path: str, data: FileContent, user=Depends(get_developer_user)):
    full_path = get_safe_path(DOCS_DIR, path)
    
    # Ensure directory exists
    os.makedirs(os.path.dirname(full_path), exist_ok=True)
    
    with open(full_path, "w", encoding="utf-8") as f:
        f.write(data.content)
        
    # Update search index
    update_fts_index(path, os.path.basename(path).replace(".md", ""), data.content)
    
    add_audit_log(user["username"], "file_updated", f"Path: {path}")
        
    return {"message": "File saved"}

@app.put("/api/files/visibility")
def set_file_visibility(path: str, data: FileVisibility, user=Depends(get_maintainer_user)):
    get_safe_path(DOCS_DIR, path) # validates the path
        
    set_public(path, data.public)
    add_audit_log(user["username"], "visibility_changed", f"Path: {path}, Public: {data.public}")
    return {"message": f"Visibility updated to {'public' if data.public else 'private'}"}

@app.post("/api/files/create")
def create_file(path: str, user=Depends(get_developer_user)):
    if not path.endswith(".md"):
        path += ".md"
        
    full_path = get_safe_path(DOCS_DIR, path)
    if os.path.exists(full_path):
        raise HTTPException(status_code=400, detail="File already exists")
        
    os.makedirs(os.path.dirname(full_path), exist_ok=True)
    
    with open(full_path, "w", encoding="utf-8") as f:
        content = f"# {os.path.basename(path).replace('.md', '')}\n\nNew file..."
        f.write(content)
        
    # Update search index
    update_fts_index(path, os.path.basename(path).replace(".md", ""), content)
        
    # Default to private
    set_public(path, False)
    add_audit_log(user["username"], "file_created", f"Path: {path}")
    return {"message": "File created", "path": path}

@app.post("/api/files/mkdir")
def create_folder(path: str, user=Depends(get_developer_user)):
    full_path = get_safe_path(DOCS_DIR, path)
    if os.path.exists(full_path):
        raise HTTPException(status_code=400, detail="Path already exists")
    os.makedirs(full_path, exist_ok=True)
    add_audit_log(user["username"], "folder_created", f"Path: {path}")
    return {"message": "Folder created", "path": path}

@app.delete("/api/files/delete")
def delete_file(path: str, user=Depends(get_maintainer_user)):
    full_path = get_safe_path(DOCS_DIR, path)
    if not os.path.exists(full_path):
        raise HTTPException(status_code=404, detail="File not found")
    
    add_audit_log(user["username"], "file_deleted", f"Path: {path}")
    
    if os.path.isdir(full_path):
        import shutil
        shutil.rmtree(full_path)
        # Note: We don't recursively delete from FTS here, but reindex on next startup will fix it.
        # For small scale, this is acceptable.
    else:
        os.remove(full_path)
        delete_fts_index(path)
        
    return {"message": "File deleted"}

@app.get("/api/search")
def search_docs(q: str, request: Request):
    if not q or len(q) < 2:
        return {"results": []}
        
    user = get_current_user(request)
    from core.auth import ROLES
    user_role = user.get("role", "guest") if user else "guest"
    can_see_private = ROLES.get(user_role, 0) >= ROLES.get("reporter", 0)
    
    # Use FTS5 ranked search
    db_results = search_fts(q)
    
    results = []
    for r in db_results:
        # Check permissions
        if not is_public(r["path"]) and not can_see_private:
            continue
        results.append(r)
                
    return {"results": results}

from fastapi import UploadFile, File
import uuid

@app.post("/api/files/upload-image")
async def upload_image(file: UploadFile = File(...), user=Depends(get_developer_user)):
    # Validate extension
    ext = os.path.splitext(file.filename)[1].lower()
    if ext not in [".png", ".jpg", ".jpeg", ".gif", ".webp", ".svg"]:
        raise HTTPException(status_code=400, detail="Invalid image format")
        
    # Ensure attachments dir exists
    attachments_dir = os.path.join(DOCS_DIR, "attachments")
    os.makedirs(attachments_dir, exist_ok=True)
    
    # Unique filename to prevent collisions
    filename = f"{uuid.uuid4()}{ext}"
    rel_path = f"attachments/{filename}"
    full_path = os.path.join(attachments_dir, filename)
    
    try:
        with open(full_path, "wb") as buffer:
            content = await file.read()
            buffer.write(content)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
        
    # Images in attachments should be public by default for viewing in docs? 
    # Or inherit from the page? Usually, images are just served.
    # Let's mark them public so they are visible.
    set_public(rel_path, True)
    
    return {"path": rel_path, "url": f"/api/files/content?path={rel_path}"}


from fastapi.responses import FileResponse

@app.get("/{rest_of_path:path}")
async def catch_all(rest_of_path: str):
    # Skip if it's an API or static file
    if rest_of_path.startswith(("api/", "static/")) or "." in rest_of_path.split("/")[-1] and not rest_of_path.endswith(".md"):
        raise HTTPException(status_code=404)
    
    index_path = os.path.join(os.path.dirname(__file__), "templates", "index.html")
    return FileResponse(index_path)

if __name__ == "__main__":
    import uvicorn
    
    # Paths relative to the project root
    base_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    cert_path = os.path.join(base_dir, "cert.pem")
    key_path = os.path.join(base_dir, "key.pem")
    
    ssl_config = {}
    if os.path.exists(cert_path) and os.path.exists(key_path):
        print(f"--- Running with HTTPS (SSL) using {cert_path} and {key_path} ---")
        ssl_config = {
            "ssl_keyfile": key_path,
            "ssl_certfile": cert_path
        }
    else:
        print("--- Running with HTTP (Warning: No SSL certificates found) ---")
        print(f"--- Looked in: {cert_path} ---")
        print("--- To enable HTTPS, generate 'cert.pem' and 'key.pem' in the project root ---")

    uvicorn.run("core.main:app", host="0.0.0.0", port=8000, reload=True, **ssl_config)
