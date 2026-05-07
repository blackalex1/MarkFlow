import os
import re
import subprocess
from git import Repo, InvalidGitRepositoryError, GitCommandError
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from typing import Optional

from core.auth import get_maintainer_user
from core.database import get_setting, set_setting, add_audit_log

DOCS_DIR = os.path.join(os.path.dirname(os.path.dirname(__file__)), "markdown_docs")
KEYS_DIR = os.path.join(os.path.dirname(__file__), "keys")
PRIVATE_KEY_PATH = os.path.join(KEYS_DIR, "id_rsa")
PUBLIC_KEY_PATH = PRIVATE_KEY_PATH + ".pub"

router = APIRouter()

class GitConfig(BaseModel):
    url: str
    token: Optional[str] = None
    branch: Optional[str] = "master"

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
    
    if url.startswith("https://"):
        clean_url = re.sub(r"https://[^@]+@", "https://", url)
        return clean_url.replace("https://", f"https://{token}@")
    
    return url

import tempfile

def ensure_keys_dir():
    if not os.path.exists(KEYS_DIR):
        os.makedirs(KEYS_DIR)

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
def generate_key(user=Depends(get_maintainer_user)):
    try:
        ensure_keys_dir()
        # Use a temporary file to generate the key, then read and delete
        with tempfile.TemporaryDirectory() as tmpdir:
            tmp_key_path = os.path.join(tmpdir, "id_rsa")
            # Use RSA 4096 in PEM format for maximum compatibility on Windows
            subprocess.run([
                "ssh-keygen", "-t", "rsa", "-b", "4096", "-m", "PEM",
                "-f", tmp_key_path, "-N", "", "-q"
            ], check=True)
            
            with open(tmp_key_path, "r") as f:
                priv = f.read()
            with open(tmp_key_path + ".pub", "r") as f:
                pub = f.read()
            
            # Save to DB
            set_setting("git_ssh_private_key", priv)
            set_setting("git_ssh_public_key", pub)
            
        add_audit_log(user["username"], "git_ssh_key_generated")
        return {"message": "SSH key generated", "pubkey": pub, "privkey": priv}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

class SSHKeyInput(BaseModel):
    private_key: str
    public_key: str

@router.post("/set-ssh-key")
def set_ssh_key(data: SSHKeyInput, user=Depends(get_maintainer_user)):
    try:
        # Save only to DB
        set_setting("git_ssh_private_key", data.private_key)
        set_setting("git_ssh_public_key", data.public_key)
        
        add_audit_log(user["username"], "git_ssh_key_manually_set")
        return {"message": "SSH key saved to database"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/config")
def set_git_remote(config: GitConfig, user=Depends(get_maintainer_user)):
    try:
        url_str = config.url.strip()
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
    
    # Auto-convert GitHub HTTPS to SSH for private repo support
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
            tmp_path = os.path.join(os.getcwd(), ".ssh_key_tmp")
            with open(tmp_path, 'wb') as f:
                f.write(priv_key.encode('utf-8'))
            
            safe_path = tmp_path.replace('\\', '/')
            try:
                ssh_cmd = f'ssh -i "{safe_path}" -o StrictHostKeyChecking=no'
                with repo.git.custom_environment(GIT_SSH_COMMAND=ssh_cmd):
                    output = repo.git.ls_remote('--heads', url)
            finally:
                if os.path.exists(tmp_path): os.remove(tmp_path)
        else:
            token = get_setting("git_token")
            auth_url = get_authenticated_url(url, token)
            output = repo.git.ls_remote('--heads', auth_url)
        
        branches = []
        for line in output.splitlines():
            parts = line.split('\t')
            if len(parts) > 1:
                branch = parts[1].replace('refs/heads/', '')
                branches.append(branch)
        
        return {"branches": branches}
    except Exception as e:
        print(f"Error fetching branches: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Git ls-remote failed: {str(e)}")

@router.get("/config")
def get_git_config(user=Depends(get_maintainer_user)):
    url = get_setting("git_url") or ""
    branch = get_setting("git_branch") or "master"
    has_ssh = bool(get_setting("git_ssh_private_key"))
    
    return {
        "url": url,
        "branch": branch,
        "has_ssh": has_ssh,
        "is_valid": has_ssh
    }

@router.post("/sync")
def sync_git(user=Depends(get_maintainer_user)):
    try:
        add_audit_log(user["username"], "git_sync_start")
        repo = get_repo()
        url = get_setting("git_url")
        token = get_setting("git_token")
        
        if not url:
            return {"message": "Local repository is ready. Please configure a Remote URL to sync."}

        # Ensure remote 'origin' is correctly set
        try:
            if 'origin' in repo.remotes:
                origin = repo.remote('origin')
                if origin.url != url:
                    repo.delete_remote('origin')
                    repo.create_remote('origin', url)
            else:
                repo.create_remote('origin', url)
        except Exception as e:
            print(f"Remote setup error: {e}")

        # Determine branch name
        branch_name = get_setting("git_branch") or "master"

        # Special handling for first sync: try to pull remote content if local is empty
        is_ssh = url.startswith("git@") or "ssh://" in url
        
        def do_pull(ssh_path=None):
            if is_ssh and ssh_path:
                ssh_cmd = f'ssh -i "{ssh_path}" -o StrictHostKeyChecking=no'
                with repo.git.custom_environment(GIT_SSH_COMMAND=ssh_cmd):
                    repo.git.fetch('origin')
                    try:
                        repo.git.pull('origin', branch_name)
                    except:
                        # If pull fails (unrelated histories), try reset if local is empty
                        if not repo.heads:
                            repo.git.reset('--hard', f'origin/{branch_name}')
            else:
                auth_url = get_authenticated_url(url, token)
                repo.git.fetch(auth_url, branch_name)
                try:
                    repo.git.pull(auth_url, branch_name)
                except:
                    if not repo.heads:
                        repo.git.reset('--hard', f'FETCH_HEAD')

        # Try initial pull before local commit logic
        try:
            if is_ssh:
                priv_key = get_setting("git_ssh_private_key")
                if priv_key:
                    priv_key = priv_key.strip().replace('\r\n', '\n') + '\n'
                    tmp_path = os.path.join(os.getcwd(), ".ssh_key_tmp")
                    with open(tmp_path, 'wb') as f:
                        f.write(priv_key.encode('utf-8'))
                    
                    safe_path = tmp_path.replace('\\', '/')
                    try:
                        do_pull(safe_path)
                    finally:
                        if os.path.exists(tmp_path): os.remove(tmp_path)
            else:
                do_pull()
        except Exception as e:
            print(f"Initial pull skipped or failed: {e}")

        # Now handle local changes
        repo.git.add(A=True)
        
        # Check if we have anything to commit OR if we have NO commits at all
        has_commits = False
        try:
            repo.head.commit
            has_commits = True
        except:
            has_commits = False

        if not has_commits:
            # Create a README if the folder is empty
            readme_path = os.path.join(DOCS_DIR, "README.md")
            if not os.path.exists(readme_path):
                with open(readme_path, "w", encoding="utf-8") as f:
                    f.write(f"# Documentation\n\nInitial repository setup by {user['username']} via MarkFlow.")
            repo.index.add(["README.md"])
            repo.index.commit("Initial commit from MarkFlow")
            has_commits = True
        elif repo.is_dirty() or repo.untracked_files:
            repo.index.commit(f"Auto-sync by {user['username']} from MarkFlow")
            
        # Final push
        try:
            branch_name = repo.active_branch.name
        except:
            branch_name = "master"
            
        if is_ssh:
            priv_key = get_setting("git_ssh_private_key")
            if priv_key:
                priv_key = priv_key.strip().replace('\r\n', '\n') + '\n'
                tmp_path = os.path.join(os.getcwd(), ".ssh_key_tmp")
                with open(tmp_path, 'wb') as f:
                    f.write(priv_key.encode('utf-8'))
                
                safe_path = tmp_path.replace('\\', '/')
                try:
                    ssh_cmd = f'ssh -i "{safe_path}" -o StrictHostKeyChecking=no'
                    with repo.git.custom_environment(GIT_SSH_COMMAND=ssh_cmd):
                        repo.git.push('origin', branch_name)
                finally:
                    if os.path.exists(tmp_path): os.remove(tmp_path)
        else:
            auth_url = get_authenticated_url(url, token)
            repo.git.push(auth_url, branch_name)
        from core.database import reindex_all_docs
        reindex_all_docs(DOCS_DIR)
        add_audit_log(user["username"], "git_sync_success")
        
        return {"message": "Sync successful"}
        
    except GitCommandError as e:
        error_msg = str(e)
        if 'token' in locals() and token:
            error_msg = error_msg.replace(token, "********")
        add_audit_log(user["username"], "git_sync_failed", error_msg[:200])
        raise HTTPException(status_code=500, detail=f"Git error: {error_msg}")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error during sync: {str(e)}")

