import os
import re
import tempfile
from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel
from typing import Optional
from git import GitCommandError

from core.auth import get_maintainer_user
from core.database import (
    get_setting, set_setting, add_audit_log,
    list_repositories, get_active_repository, get_repository, 
    add_repository, update_repository, delete_repository, set_active_repository, get_db
)
from core.config import limiter, SECURITY_LIMITS
from core.services.git_service import get_repo, sync_repository
from core.services.ssh_service import generate_ssh_key, save_ssh_key

def slugify(text: str) -> str:
    # Convert to lowercase and replace non-alphanumeric with hyphens
    text = text.lower()
    text = re.sub(r'[^a-z0-9_\-]', '-', text)
    # Remove multiple hyphens
    text = re.sub(r'-+', '-', text)
    return text.strip('-')

def validate_git_url(url: str):
    if not url: return
    if url.startswith("-"):
        raise HTTPException(status_code=400, detail="Invalid Git URL: cannot start with a hyphen")
    if re.search(r"[\s;`\"'|&<>]", url):
        raise HTTPException(status_code=400, detail="Invalid Git URL: illegal characters detected")
    if not (url.startswith("https://") or url.startswith("git@") or url.startswith("ssh://")):
        raise HTTPException(status_code=400, detail="Invalid Git URL: protocol not allowed")
    
    # Block argument injection in ssh:// urls (e.g. ssh://-oProxyCommand=...)
    if url.startswith("ssh://") and url[6:].startswith("-"):
         raise HTTPException(status_code=400, detail="Invalid Git URL: argument injection detected")

def validate_slug(slug: str):
    if not slug:
        raise HTTPException(status_code=400, detail="Folder name (slug) is required")
    if slug.startswith(".") or "/" in slug or "\\" in slug:
        raise HTTPException(status_code=400, detail="Invalid folder name: path manipulation detected")
    if not re.match(r"^[a-z0-9_\-]+$", slug):
        raise HTTPException(status_code=400, detail="Invalid folder name: use only lowercase letters, numbers, hyphens and underscores")

router = APIRouter()

class RepoInput(BaseModel):
    name: str
    slug: str
    url: str
    branch: str = "master"
    private_key: Optional[str] = None
    public_key: Optional[str] = None
    key_id: Optional[str] = None
    auto_sync_interval: Optional[int] = 0
    sync_strategy: Optional[str] = "rebase"
    flatten_in_tree: Optional[bool] = False

@router.get("/repos")
def api_list_repos(user=Depends(get_maintainer_user)):
    return list_repositories()

@router.post("/repos")
@limiter.limit(SECURITY_LIMITS["file_ops"])
def api_add_repo(request: Request, data: RepoInput, user=Depends(get_maintainer_user)):
    validate_git_url(data.url)
    safe_slug = slugify(data.slug) if data.slug else slugify(data.name)
    validate_slug(safe_slug)
    
    priv = data.private_key if data.private_key else None
    pub = data.public_key if data.public_key else None
    if data.key_id:
        conn = get_db()
        cur = conn.cursor()
        cur.execute("SELECT private_key FROM temp_ssh_keys WHERE id = ?", (data.key_id,))
        row = cur.fetchone()
        if row:
            priv = row[0]
            cur.execute("DELETE FROM temp_ssh_keys WHERE id = ?", (data.key_id,))
            conn.commit()
        conn.close()

    repo_id = add_repository(data.name, safe_slug, data.url, data.branch, priv, data.public_key, data.auto_sync_interval, data.sync_strategy, data.flatten_in_tree)
    add_audit_log(user["username"], "git_repo_added", f"Name: {data.name}, Slug: {safe_slug}", ip_address=request.client.host)
    return {"id": repo_id, "slug": safe_slug}

@router.post("/repos/{repo_id}/activate")
def api_activate_repo(repo_id: int, user=Depends(get_maintainer_user)):
    set_active_repository(repo_id)
    return {"message": "Repository activated"}

@router.delete("/repos/{repo_id}")
def api_delete_repo(repo_id: int, user=Depends(get_maintainer_user)):
    delete_repository(repo_id)
    return {"message": "Repository deleted"}

@router.put("/repos/{repo_id}")
def api_update_repo(repo_id: int, data: RepoInput, user=Depends(get_maintainer_user)):
    validate_git_url(data.url)
    safe_slug = slugify(data.slug)
    validate_slug(safe_slug)
    
    priv = data.private_key if data.private_key else None
    pub = data.public_key if data.public_key else None
    if data.key_id:
        conn = get_db()
        cur = conn.cursor()
        cur.execute("SELECT private_key FROM temp_ssh_keys WHERE id = ?", (data.key_id,))
        row = cur.fetchone()
        if row:
            priv = row[0]
            cur.execute("DELETE FROM temp_ssh_keys WHERE id = ?", (data.key_id,))
            conn.commit()
        conn.close()

    update_repository(repo_id, data.name, safe_slug, data.url, data.branch, priv, pub, data.auto_sync_interval, data.sync_strategy, data.flatten_in_tree)
    return {"message": "Repository updated", "slug": safe_slug}

@router.get("/ssh-status")
def get_ssh_status(user=Depends(get_maintainer_user)):
    repo = get_active_repository()
    if not repo: return {"has_keys": False}
    return {"has_keys": bool(repo['ssh_private_key'] and repo['ssh_public_key'])}

@router.get("/pubkey")
def get_pubkey(user=Depends(get_maintainer_user)):
    repo = get_active_repository()
    return {"pubkey": repo['ssh_public_key'] if repo else None}

@router.get("/repos/{repo_id}/pubkey")
def get_repo_pubkey(repo_id: int, user=Depends(get_maintainer_user)):
    from core.database import get_repository
    repo = get_repository(repo_id)
    if not repo:
        raise HTTPException(status_code=404, detail="Repository not found")
    
    pubkey = repo.get('ssh_public_key')
    if not pubkey:
        from core.database import get_setting
        pubkey = get_setting('git_ssh_public_key')
        return {"pubkey": pubkey, "type": "global"}
    
    return {"pubkey": pubkey, "type": "unique"}

@router.get("/gen-key-pair")
def api_gen_key_pair(user=Depends(get_maintainer_user)):
    try:
        from core.services.ssh_service import generate_key_pair
        import uuid
        priv, pub = generate_key_pair()
        
        key_id = str(uuid.uuid4())
        conn = get_db()
        cur = conn.cursor()
        # Clean up old temp keys (older than 1 hour)
        cur.execute("DELETE FROM temp_ssh_keys WHERE created_at < datetime('now', '-1 hour')")
        cur.execute("INSERT INTO temp_ssh_keys (id, private_key) VALUES (?, ?)", (key_id, priv))
        conn.commit()
        conn.close()
        
        return {"key_id": key_id, "public_key": pub}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/generate-key")
@limiter.limit(SECURITY_LIMITS["file_ops"])
def api_generate_key(request: Request, user=Depends(get_maintainer_user)):
    try:
        return generate_ssh_key(user["username"], ip_address=request.client.host)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

class SSHKeyInput(BaseModel):
    private_key: str
    public_key: str

@router.post("/set-ssh-key")
@limiter.limit(SECURITY_LIMITS["file_ops"])
def api_set_ssh_key(request: Request, data: SSHKeyInput, user=Depends(get_maintainer_user)):
    try:
        return save_ssh_key(user["username"], data.private_key, data.public_key, ip_address=request.client.host)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/branches")
def get_remote_branches(url: str = None, key_id: str = None, user=Depends(get_maintainer_user)):
    repo_data = None
    if key_id:
        # User just generated a key but hasn't saved yet
        conn = get_db()
        cur = conn.cursor()
        cur.execute("SELECT private_key FROM temp_ssh_keys WHERE id = ?", (key_id,))
        row = cur.fetchone()
        conn.close()
        if row:
            repo_data = {"url": url, "ssh_private_key": row[0], "ssh_public_key": None}
    
    if not repo_data and url:
        # Try to find repo with this URL to get keys
        conn = get_db()
        cursor = conn.cursor()
        cursor.execute("SELECT * FROM git_repositories WHERE url = ?", (url,))
        row = cursor.fetchone()
        conn.close()
        if row:
            repo_data = dict(row)
        else:
            # New repository, not in DB yet. Use the provided URL and global keys.
            repo_data = {"url": url, "ssh_private_key": None, "ssh_public_key": None}
    
    if not repo_data:
        repo_data = get_active_repository()
        
    if not repo_data or not repo_data.get('url'):
        raise HTTPException(status_code=400, detail="No repository URL provided or active.")
    
    try:
        from core.services.git_service import get_remote_branches_list
        branches = get_remote_branches_list(repo_data)
        return {"branches": branches}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/config")
def get_git_config(user=Depends(get_maintainer_user)):
    repo = get_active_repository()
    if not repo: return {"url": "", "branch": "master", "has_ssh": False}
    return {
        "url": repo['url'],
        "branch": repo['branch'] or "master",
        "has_ssh": bool(repo['ssh_private_key']),
        "is_valid": bool(repo['ssh_private_key']),
        "last_sync_status": repo.get('last_sync_status'),
        "last_sync_error": repo.get('last_sync_error'),
        "last_sync_at": repo.get('last_sync_at'),
        "auto_sync_interval": repo.get('auto_sync_interval'),
        "sync_strategy": repo.get('sync_strategy')
    }

@router.post("/sync")
@limiter.limit(SECURITY_LIMITS["file_ops"])
def api_sync_git(request: Request, force: bool = False, user=Depends(get_maintainer_user)):
    try:
        return sync_repository(user["username"], force=force, ip_address=request.client.host, is_auto=False)
    except GitCommandError as e:
        error_msg = str(e)
        repo = get_active_repository()
        add_audit_log(user["username"], "git_sync_failed", error_msg[:200], ip_address=request.client.host)
        raise HTTPException(status_code=500, detail=f"Git error: {error_msg}")
    except Exception as e:
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))
