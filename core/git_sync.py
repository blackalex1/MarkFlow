import os
import re
import tempfile
from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel
from typing import Optional
from git import GitCommandError

from core.auth import get_maintainer_user
from core.database import get_setting, set_setting, add_audit_log
from core.config import limiter
from core.security_config import SECURITY_LIMITS
from core.services.git_service import get_repo, sync_repository, get_authenticated_url
from core.services.ssh_service import generate_ssh_key, save_ssh_key

def validate_git_url(url: str):
    if not url: return
    # Prevent argument injection
    if url.startswith("-"):
        raise HTTPException(status_code=400, detail="Invalid Git URL: cannot start with a hyphen")
    # Block characters that could be used for command injection or URL manipulation
    if re.search(r"[\s;`\"'|&<>]", url):
        raise HTTPException(status_code=400, detail="Invalid Git URL: illegal characters detected")
    if not (url.startswith("https://") or url.startswith("git@") or url.startswith("ssh://")):
        raise HTTPException(status_code=400, detail="Invalid Git URL: protocol not allowed")

router = APIRouter()

class GitConfig(BaseModel):
    url: str
    token: Optional[str] = None
    branch: Optional[str] = "master"

class SSHKeyInput(BaseModel):
    private_key: str
    public_key: str

@router.get("/ssh-status")
def get_ssh_status(user=Depends(get_maintainer_user)):
    has_priv = get_setting("git_ssh_private_key") is not None
    has_pub = get_setting("git_ssh_public_key") is not None
    return {"has_keys": has_priv and has_pub}

@router.get("/pubkey")
def get_pubkey(user=Depends(get_maintainer_user)):
    pub = get_setting("git_ssh_public_key")
    return {"pubkey": pub}

@router.post("/generate-key")
@limiter.limit(SECURITY_LIMITS["file_ops"])
def api_generate_key(request: Request, user=Depends(get_maintainer_user)):
    try:
        return generate_ssh_key(user["username"])
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/set-ssh-key")
@limiter.limit(SECURITY_LIMITS["file_ops"])
def api_set_ssh_key(request: Request, data: SSHKeyInput, user=Depends(get_maintainer_user)):
    try:
        return save_ssh_key(user["username"], data.private_key, data.public_key)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/config")
@limiter.limit(SECURITY_LIMITS["file_ops"])
def set_git_remote(request: Request, config: GitConfig, user=Depends(get_maintainer_user)):
    try:
        url_str = config.url.strip()
        validate_git_url(url_str)
        set_setting("git_url", url_str)
        if config.token is not None:
            set_setting("git_token", config.token)
        if config.branch:
            set_setting("git_branch", config.branch)
        
        add_audit_log(user["username"], "git_config_updated")

        repo = get_repo()
        if repo.remotes:
            repo.delete_remote('origin')
        
        clean_url = re.sub(r"https://[^@]+@", "https://", url_str)
        repo.create_remote('origin', clean_url)
        
        return {"message": "Remote configured successfully"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/branches")
def get_remote_branches(user=Depends(get_maintainer_user)):
    url = get_setting("git_url")
    if not url:
        raise HTTPException(status_code=400, detail="Git URL not configured")
    
    if url.startswith('https://github.com/'):
        path = url.replace('https://github.com/', '')
        clean_path = re.sub(r'\.git$', '', path).strip('/')
        url = f"git@github.com:{clean_path}.git"

    repo = get_repo()
    is_ssh = url.startswith("git@") or "ssh://" in url
    
    try:
        if is_ssh:
            priv_key = get_setting("git_ssh_private_key")
            if not priv_key:
                raise HTTPException(status_code=400, detail="SSH private key not found")
            
            priv_key = priv_key.strip().replace('\r\n', '\n') + '\n'
            
            with tempfile.NamedTemporaryFile(mode='wb', delete=False) as tmp:
                tmp.write(priv_key.encode('utf-8'))
                tmp_path = tmp.name
            
            # On Linux, SSH keys MUST have strict permissions (600)
            if os.name != 'nt':
                os.chmod(tmp_path, 0o600)
            
            safe_ssh_path = tmp_path.replace("\\", "/")
            try:
                ssh_cmd = f'ssh -i "{safe_ssh_path}" -o StrictHostKeyChecking=no'
                with repo.git.custom_environment(GIT_SSH_COMMAND=ssh_cmd):
                    output = repo.git.ls_remote('--heads', url)
            finally:
                if os.path.exists(tmp_path):
                    try: os.remove(tmp_path)
                    except: pass
        else:
            token = get_setting("git_token")
            auth_url = get_authenticated_url(url, token)
            output = repo.git.ls_remote('--heads', auth_url)
        
        branches = [line.split('\t')[1].replace('refs/heads/', '') for line in output.splitlines() if '\t' in line]
        return {"branches": branches}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Git error: {str(e)}")

@router.get("/config")
def get_git_config(user=Depends(get_maintainer_user)):
    return {
        "url": get_setting("git_url") or "",
        "branch": get_setting("git_branch") or "master",
        "has_ssh": bool(get_setting("git_ssh_private_key")),
        "is_valid": bool(get_setting("git_ssh_private_key"))
    }

@router.post("/sync")
@limiter.limit(SECURITY_LIMITS["file_ops"])
def api_sync_git(request: Request, user=Depends(get_maintainer_user)):
    try:
        return sync_repository(user["username"])
    except GitCommandError as e:
        error_msg = str(e)
        token = get_setting("git_token")
        if token: error_msg = error_msg.replace(token, "********")
        add_audit_log(user["username"], "git_sync_failed", error_msg[:200])
        raise HTTPException(status_code=500, detail=f"Git error: {error_msg}")
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
