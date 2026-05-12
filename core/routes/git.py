import os
import re
from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel
from typing import Optional, List
from git import GitCommandError

from core.auth import get_maintainer_user, get_owner_user
from core.db.base import get_db
from core.db.settings import get_setting
from core.db.repos import (
    list_repositories, get_active_repository, get_repository, 
    add_repository, update_repository, delete_repository, set_active_repository
)
from core.db.audit import add_audit_log
from core.db.crypto import decrypt_value, encrypt_value
from core.config import limiter, SECURITY_LIMITS
from core.services.git_service import sync_repository, get_remote_branches_list, GitConflictError
from core.services.ssh_service import (
    generate_ssh_key, save_ssh_key, 
    generate_global_ssh_key, save_global_ssh_key
)
from core.utils import slugify

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

class RepoOutput(BaseModel):
    id: int
    name: str
    slug: str
    url: str
    branch: str
    has_ssh_key: bool
    ssh_public_key: Optional[str] = None
    is_active: bool
    auto_sync_interval: int
    sync_strategy: str
    last_sync_status: Optional[str] = None
    last_sync_error: Optional[str] = None
    last_sync_at: Optional[str] = None
    flatten_in_tree: bool

def validate_git_url(url: str):
    if not (url.startswith('http://') or url.startswith('https://') or url.startswith('git@')):
        raise HTTPException(status_code=400, detail="Invalid Git URL")

def validate_slug(slug: str):
    if not re.match(r"^[a-z0-9_\-]+$", slug):
        raise HTTPException(status_code=400, detail="Invalid folder name")

@router.get("/repos", response_model=List[RepoOutput])
def api_list_repos(user=Depends(get_maintainer_user)):
    return list_repositories()

@router.post("/repos")
@limiter.limit(SECURITY_LIMITS["file_ops"])
def api_add_repo(request: Request, data: RepoInput, user=Depends(get_maintainer_user)):
    validate_git_url(data.url)
    safe_slug = slugify(data.slug) if data.slug else slugify(data.name)
    validate_slug(safe_slug)
    
    priv, pub = data.private_key, data.public_key
    if data.key_id:
        conn = get_db()
        row = conn.execute("SELECT private_key FROM temp_ssh_keys WHERE id = ?", (data.key_id,)).fetchone()
        if row:
            priv = decrypt_value(row[0])
            conn.execute("DELETE FROM temp_ssh_keys WHERE id = ?", (data.key_id,))
            conn.commit()
        conn.close()

    repo_id = add_repository(data.name, safe_slug, data.url, data.branch, priv, pub, data.auto_sync_interval, data.sync_strategy, data.flatten_in_tree)
    add_audit_log(user["username"], "git_repo_added", f"Slug: {safe_slug}", ip_address=request.client.host)
    return {"id": repo_id, "slug": safe_slug}

@router.post("/repos/{repo_id}/activate")
def api_activate_repo(repo_id: int, user=Depends(get_maintainer_user)):
    set_active_repository(repo_id)
    return {"message": "Activated"}

@router.delete("/repos/{repo_id}")
def api_delete_repo(request: Request, repo_id: int, user=Depends(get_maintainer_user)):
    repo = get_repository(repo_id)
    repo_name = repo['name'] if repo else f"ID: {repo_id}"
    delete_repository(repo_id)
    add_audit_log(user["username"], "git_repo_deleted", f"Repo: {repo_name}", ip_address=request.client.host)
    return {"message": "Deleted"}

@router.put("/repos/{repo_id}")
@limiter.limit(SECURITY_LIMITS["file_ops"])
def api_update_repo(request: Request, repo_id: int, data: RepoInput, user=Depends(get_maintainer_user)):
    validate_git_url(data.url)
    safe_slug = slugify(data.slug)
    validate_slug(safe_slug)
    
    priv, pub = data.private_key, data.public_key
    if data.key_id:
        conn = get_db()
        row = conn.execute("SELECT private_key FROM temp_ssh_keys WHERE id = ?", (data.key_id,)).fetchone()
        if row:
            priv = decrypt_value(row[0])
            conn.execute("DELETE FROM temp_ssh_keys WHERE id = ?", (data.key_id,))
            conn.commit()
        conn.close()

    update_repository(repo_id, data.name, safe_slug, data.url, data.branch, priv, pub, data.auto_sync_interval, data.sync_strategy, data.flatten_in_tree)
    
    log_msg = f"Slug: {safe_slug}"
    if priv or pub:
        log_msg += " (SSH keys updated)"
    add_audit_log(user["username"], "git_repo_updated", log_msg, ip_address=request.client.host)
    
    return {"message": "Updated"}

@router.get("/ssh-status")
def get_ssh_status(user=Depends(get_maintainer_user)):
    repo = get_active_repository(include_secrets=True)
    if not repo: return {"has_keys": False}
    return {"has_keys": bool(repo['ssh_private_key'] and repo['ssh_public_key'])}

@router.get("/pubkey")
def api_get_pubkey(request: Request, user=Depends(get_maintainer_user)):
    add_audit_log(user["username"], "git_ssh_pubkey_viewed", details="Global SSH public key viewed", ip_address=request.client.host)
    return {"pubkey": get_setting('git_ssh_public_key')}

@router.get("/repos/{repo_id}/pubkey")
def api_get_repo_pubkey(request: Request, repo_id: int, user=Depends(get_maintainer_user)):
    repo = get_repository(repo_id)
    if not repo:
        raise HTTPException(status_code=404, detail="Repository not found")
    
    pubkey = repo.get('ssh_public_key')
    if not pubkey:
        return {"pubkey": get_setting('git_ssh_public_key'), "type": "global"}
    
    repo_name = repo['name'] if repo else f"ID: {repo_id}"
    add_audit_log(user["username"], "git_repo_ssh_pubkey_viewed", details=f"Unique SSH public key viewed for repo: {repo_name}", ip_address=request.client.host)
    return {"pubkey": pubkey, "type": "unique"}

@router.post("/generate-key")
@limiter.limit(SECURITY_LIMITS["file_ops"])
def api_generate_key(request: Request, user=Depends(get_maintainer_user)):
    try:
        return generate_ssh_key(user["username"], ip_address=request.client.host)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/generate-global-key")
@limiter.limit(SECURITY_LIMITS["file_ops"])
def api_generate_global_key(request: Request, user=Depends(get_maintainer_user)):
    try:
        return generate_global_ssh_key(user["username"], ip_address=request.client.host)
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

@router.post("/set-global-ssh-key")
@limiter.limit(SECURITY_LIMITS["file_ops"])
def api_set_global_ssh_key(request: Request, data: SSHKeyInput, user=Depends(get_maintainer_user)):
    try:
        return save_global_ssh_key(user["username"], data.private_key, data.public_key, ip_address=request.client.host)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/gen-key-pair")
@limiter.limit(SECURITY_LIMITS["file_ops"])
def api_gen_key_pair(request: Request, user=Depends(get_maintainer_user)):
    from core.services.ssh_service import generate_key_pair
    import uuid
    priv, pub = generate_key_pair()
    key_id = str(uuid.uuid4())
    conn = get_db()
    conn.execute("DELETE FROM temp_ssh_keys WHERE created_at < datetime('now', '-1 hour')")
    conn.execute("INSERT INTO temp_ssh_keys (id, private_key) VALUES (?, ?)", (key_id, encrypt_value(priv)))
    conn.commit()
    conn.close()
    add_audit_log(user["username"], "git_ssh_temp_key_generated", details="Temporary unique SSH key pair generated", ip_address=request.client.host)
    return {"key_id": key_id, "public_key": pub}

@router.get("/branches")
@limiter.limit(SECURITY_LIMITS["file_ops"])
def get_remote_branches(request: Request, url: str = None, key_id: str = None, user=Depends(get_maintainer_user)):
    repo_data = None
    if key_id:
        conn = get_db()
        row = conn.execute("SELECT private_key FROM temp_ssh_keys WHERE id = ?", (key_id,)).fetchone()
        conn.close()
        if row:
            repo_data = {"url": url, "ssh_private_key": decrypt_value(row[0])}
    
    if not repo_data:
        repo_data = get_active_repository(include_secrets=True)
        
    if not repo_data:
        raise HTTPException(status_code=400, detail="No repo")
    
    branches = get_remote_branches_list(repo_data)
    return {"branches": branches}

@router.get("/config")
def get_git_config(user=Depends(get_maintainer_user)):
    repo = get_active_repository(include_secrets=True)
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
    except GitConflictError as e:
        raise HTTPException(status_code=409, detail=str(e))
    except GitCommandError as e:
        raise HTTPException(status_code=500, detail=f"Git error: {str(e)}")
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
