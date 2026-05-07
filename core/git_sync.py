import os
import re
from git import Repo, InvalidGitRepositoryError, GitCommandError
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, HttpUrl
from typing import Optional

from core.auth import get_maintainer_user
from core.database import get_setting, set_setting, add_audit_log

DOCS_DIR = os.path.join(os.path.dirname(os.path.dirname(__file__)), "markdown_docs")

router = APIRouter()

class GitConfig(BaseModel):
    url: HttpUrl
    token: Optional[str] = None

def get_repo():
    if not os.path.exists(DOCS_DIR):
        os.makedirs(DOCS_DIR)
    try:
        repo = Repo(DOCS_DIR)
        return repo
    except InvalidGitRepositoryError:
        repo = Repo.init(DOCS_DIR)
        return repo

def get_authenticated_url(url: str, token: Optional[str]) -> str:
    if not token:
        return url
    
    # Support for https://token@github.com/... format
    if url.startswith("https://"):
        # Remove existing credentials if any
        clean_url = re.sub(r"https://[^@]+@", "https://", url)
        return clean_url.replace("https://", f"https://{token}@")
    
    return url

@router.post("/config")
def set_git_remote(config: GitConfig, user=Depends(get_maintainer_user)):
    try:
        url_str = str(config.url)
        # Save to DB
        set_setting("git_url", url_str)
        if config.token is not None:
            set_setting("git_token", config.token)
        
        add_audit_log(user["username"], "git_config_updated")

        repo = get_repo()
        # Update local git config as well for convenience
        if repo.remotes:
            repo.delete_remote('origin')
        
        # We don't save the token in the local .git/config for security
        # We only save the clean URL there
        clean_url = re.sub(r"https://[^@]+@", "https://", url_str)
        repo.create_remote('origin', clean_url)
        
        return {"message": "Remote configured successfully"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/config")
def get_git_config(user=Depends(get_maintainer_user)):
    url = get_setting("git_url") or ""
    token = get_setting("git_token")
    return {
        "url": url,
        "has_token": token is not None and len(token) > 0
    }

@router.post("/sync")
def sync_git(user=Depends(get_maintainer_user)):
    try:
        add_audit_log(user["username"], "git_sync_start")
        
        repo = get_repo()
        
        # Add all changes
        repo.git.add(A=True)
        
        # Commit if there are changes
        if repo.is_dirty() or repo.untracked_files:
            repo.index.commit("Auto-sync from Notion-like docs UI")
        
        # Get config from DB
        url = get_setting("git_url")
        token = get_setting("git_token")
        
        if not url:
            return {"message": "Committed locally. No remote configured."}
            
        auth_url = get_authenticated_url(url, token)
        
        # Pull & Push using authenticated URL
        # We use repo.git directly to specify the URL to avoid saving it in config
        try:
            # Pull
            repo.git.pull(auth_url, repo.active_branch.name)
        except GitCommandError as e:
            # Mask token in error message if present
            error_msg = str(e)
            if token:
                error_msg = error_msg.replace(token, "********")
            # If it's just "couldn't find remote ref", maybe it's a new repo
            if "couldn't find remote ref" not in error_msg.lower():
                # We continue to push even if pull fails (might be initial sync)
                pass 

        try:
            # Push
            repo.git.push(auth_url, repo.active_branch.name)
            add_audit_log(user["username"], "git_sync_success")
        except GitCommandError as e:
            error_msg = str(e)
            if token:
                error_msg = error_msg.replace(token, "********")
            add_audit_log(user["username"], "git_sync_failed", error_msg[:200])
            raise HTTPException(status_code=500, detail=f"Git push error: {error_msg}")
        
        return {"message": "Sync successful"}
        
    except GitCommandError as e:
        error_msg = str(e)
        if 'token' in locals() and token:
            error_msg = error_msg.replace(token, "********")
        add_audit_log(user["username"], "git_sync_failed", error_msg[:200])
        raise HTTPException(status_code=500, detail=f"Git error: {error_msg}")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error during sync: {str(e)}")
