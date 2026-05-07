import os
import re
from git import Repo, InvalidGitRepositoryError, GitCommandError
from core.database import get_setting, set_setting, add_audit_log, reindex_all_docs
from core.config import DOCS_DIR

def get_repo():
    if not os.path.exists(DOCS_DIR):
        os.makedirs(DOCS_DIR)
    try:
        repo = Repo(DOCS_DIR)
        return repo
    except InvalidGitRepositoryError:
        repo = Repo.init(DOCS_DIR)
        return repo

def get_authenticated_url(url: str, token: str = None) -> str:
    if not token:
        return url
    if url.startswith("https://"):
        clean_url = re.sub(r"https://[^@]+@", "https://", url)
        return clean_url.replace("https://", f"https://{token}@")
    return url

def sync_repository(username: str):
    add_audit_log(username, "git_sync_start")
    repo = get_repo()
    url = get_setting("git_url")
    token = get_setting("git_token")
    
    if not url:
        return {"message": "Local repository is ready. Please configure a Remote URL to sync."}

    # Ensure remote 'origin' is correctly set
    if 'origin' in repo.remotes:
        origin = repo.remote('origin')
        if origin.url != url:
            repo.delete_remote('origin')
            repo.create_remote('origin', url)
    else:
        repo.create_remote('origin', url)

    branch_name = get_setting("git_branch") or "master"
    is_ssh = url.startswith("git@") or "ssh://" in url
    
    def do_pull(ssh_path=None):
        if is_ssh and ssh_path:
            ssh_cmd = f'ssh -i "{ssh_path}" -o StrictHostKeyChecking=no'
            with repo.git.custom_environment(GIT_SSH_COMMAND=ssh_cmd):
                repo.git.fetch('origin')
                try:
                    repo.git.pull('origin', branch_name)
                except:
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

    # Initial pull
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
        print(f"Initial pull failed: {e}")

    # Local changes
    repo.git.add(A=True)
    has_commits = False
    try:
        repo.head.commit
        has_commits = True
    except:
        has_commits = False

    if not has_commits:
        readme_path = os.path.join(DOCS_DIR, "README.md")
        if not os.path.exists(readme_path):
            with open(readme_path, "w", encoding="utf-8") as f:
                f.write(f"# Documentation\n\nInitial repository setup by {username} via MarkFlow.")
        repo.index.add(["README.md"])
        repo.index.commit("Initial commit from MarkFlow")
    elif repo.is_dirty() or repo.untracked_files:
        repo.index.commit(f"Auto-sync by {username} from MarkFlow")
        
    # Push
    try:
        push_branch = repo.active_branch.name
    except:
        push_branch = "master"
        
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
                    repo.git.push('origin', push_branch)
            finally:
                if os.path.exists(tmp_path): os.remove(tmp_path)
    else:
        auth_url = get_authenticated_url(url, token)
        repo.git.push(auth_url, push_branch)

    reindex_all_docs(DOCS_DIR)
    add_audit_log(username, "git_sync_success")
    return {"message": "Sync successful"}
