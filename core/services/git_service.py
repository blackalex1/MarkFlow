import os
import re
from datetime import datetime
from git import Repo, InvalidGitRepositoryError, GitCommandError
from core.database import get_setting, set_setting, add_audit_log, reindex_all_docs, get_active_repository, get_db
from core.config import DOCS_DIR

def get_repo(path=DOCS_DIR):
    if not os.path.exists(path):
        os.makedirs(path)
    
    try:
        from git import Git
        Git().config("--global", "--add", "safe.directory", path.replace('\\', '/'))
    except Exception as e:
        print(f"Warning: Could not set git safe.directory for {path}: {e}")

    try:
        repo = Repo(path)
        return repo
    except InvalidGitRepositoryError:
        repo = Repo.init(path)
        return repo

def get_authenticated_url(url: str, token: str = None) -> str:
    if not token:
        return url
    if url.startswith("https://"):
        clean_url = re.sub(r"https://[^@]+@", "https://", url)
        return clean_url.replace("https://", f"https://{token}@")
    return url

def sync_repository(username: str, force: bool = False, ip_address: str = ""):
    add_audit_log(username, "git_sync_start", f"Force: {force}", ip_address=ip_address)
    
    active_repo = get_active_repository()
    if not active_repo:
        return {"message": "No active repository configured."}

    def update_sync_status(status, error=None):
        try:
            conn = get_db()
            cur = conn.cursor()
            cur.execute("UPDATE git_repositories SET last_sync_status = ?, last_sync_error = ?, last_sync_at = ? WHERE id = ?", 
                        (status, error, datetime.now().isoformat(), active_repo['id']))
            conn.commit()
            conn.close()
        except: pass

    # Isolated folder for this repo
    repo_slug = active_repo['slug'] or f"repo_{active_repo['id']}"
    target_dir = os.path.join(DOCS_DIR, repo_slug)
    
    if not os.path.exists(target_dir):
        os.makedirs(target_dir)

    try:
        from git import Git
        Git().config("--global", "--add", "safe.directory", target_dir.replace('\\', '/'))
        
        repo = None
        try:
            repo = Repo(target_dir)
        except:
            repo = Repo.init(target_dir)

        url = active_repo['url']
        branch_name = active_repo['branch'] or "master"
        
        # Auto-convert GitHub HTTPS to SSH
        if url and url.startswith('https://github.com/'):
            path = url.replace('https://github.com/', '')
            clean_path = re.sub(r'\.git$', '', path).strip('/')
            url = f"git@github.com:{clean_path}.git"

        # Ensure remote 'origin' is correctly set
        if 'origin' in repo.remotes:
            origin = repo.remote('origin')
            if origin.url != url:
                repo.delete_remote('origin')
                repo.create_remote('origin', url)
        else:
            repo.create_remote('origin', url)

        is_ssh = url.startswith("git@") or "ssh://" in url
        if not is_ssh:
            raise Exception(f"Only SSH repositories are supported. Use an SSH URL for {url}")

        priv_key = active_repo['ssh_private_key']
        if not priv_key:
            from core.database import get_setting
            priv_key = get_setting('git_ssh_private_key')
        
        if not priv_key:
            raise Exception("Neither repository-specific nor global SSH private key found.")

        priv_key = priv_key.strip().replace('\r\n', '\n') + '\n'
        import tempfile
        with tempfile.NamedTemporaryFile(mode='wb', delete=False) as tmp:
            tmp.write(priv_key.encode('utf-8'))
            tmp_path = tmp.name
        if os.name != 'nt': os.chmod(tmp_path, 0o600)
        safe_tmp_path = tmp_path.replace("\\", "/")
        ssh_cmd = f'ssh -i "{safe_tmp_path}" -o StrictHostKeyChecking=no'

        try:
            with repo.git.custom_environment(GIT_SSH_COMMAND=ssh_cmd):
                # Ensure .gitignore exists
                gitignore_path = os.path.join(target_dir, ".gitignore")
                stock_ignores = ["metadata.json", ".DS_Store", "Thumbs.db", "__pycache__/", "*.tmp"]
                try:
                    existing_ignores = []
                    if os.path.exists(gitignore_path):
                        with open(gitignore_path, "r") as f:
                            existing_ignores = f.read().splitlines()
                    new_ignores = existing_ignores
                    for ignore in stock_ignores:
                        if ignore not in existing_ignores: new_ignores.append(ignore)
                    if new_ignores != existing_ignores:
                        with open(gitignore_path, "w") as f: f.write("\n".join(new_ignores) + "\n")
                except: pass

                if force:
                    repo.git.fetch('origin')
                    # Ensure we are on the correct branch locally
                    try:
                        repo.git.checkout(branch_name)
                    except:
                        repo.git.checkout('-b', branch_name)
                    
                    repo.git.reset('--hard', f'origin/{branch_name}')
                    repo.git.clean('-fd')
                    add_audit_log(username, "git_force_sync_success", ip_address=ip_address)
                else:
                    # Regular Sync
                    try:
                        repo.config_writer().set_value("user", "name", "MarkFlow AutoSync").release()
                        repo.config_writer().set_value("user", "email", "sync@markflow.local").release()
                    except: pass
                    
                    # Ensure we are on the correct branch before pull
                    try:
                        repo.git.checkout(branch_name)
                    except:
                        # If it's a new repo with no commits, checkout -b will work after first commit
                        pass
                    
                    repo.git.fetch('origin')
                    try:
                        repo.git.pull('origin', branch_name, '--no-rebase', '--allow-unrelated-histories')
                    except Exception as e:
                        print(f"Pull warning: {e}")
                    
                    # Push local changes
                    repo.git.add(A=True)
                    has_commits = False
                    try:
                        repo.head.commit
                        has_commits = True
                    except: has_commits = False

                    if not has_commits:
                        readme_path = os.path.join(target_dir, "README.md")
                        if not os.path.exists(readme_path):
                            with open(readme_path, "w", encoding="utf-8") as f:
                                f.write(f"# Documentation\n\nInitial repository setup via MarkFlow.")
                        repo.index.add(["README.md"])
                        repo.index.commit("Initial commit from MarkFlow")
                        # Now that we have a commit, ensure we are on the right branch
                        try:
                            repo.git.branch('-M', branch_name)
                        except: pass
                    elif repo.is_dirty() or repo.untracked_files:
                        repo.index.commit(f"Auto-sync by {username} from MarkFlow")
                    
                    # Ensure we are definitely on the right branch before push
                    try:
                        repo.git.checkout(branch_name)
                    except:
                        try: repo.git.checkout('-b', branch_name)
                        except: pass

                    repo.git.push('origin', branch_name)
                    add_audit_log(username, "git_sync_success", ip_address=ip_address)
        finally:
            if os.path.exists(tmp_path): os.remove(tmp_path)
        
        reindex_all_docs(DOCS_DIR)
        update_sync_status('success')
        return {"message": "Sync successful"}
    except Exception as e:
        update_sync_status('error', str(e))
        raise e

def get_remote_branches_list(repo_data: dict):
    url = repo_data['url']
    if url.startswith('https://github.com/'):
        path = url.replace('https://github.com/', '')
        clean_path = re.sub(r'\.git$', '', path).strip('/')
        url = f"git@github.com:{clean_path}.git"

    priv_key = repo_data['ssh_private_key']
    if not priv_key:
        from core.database import get_setting
        priv_key = get_setting('git_ssh_private_key')
        
    if not priv_key:
        raise Exception("Neither repository-specific nor global SSH private key found.")
    
    priv_key = priv_key.strip().replace('\r\n', '\n') + '\n'
    import tempfile
    with tempfile.NamedTemporaryFile(mode='wb', delete=False) as tmp:
        tmp.write(priv_key.encode('utf-8'))
        tmp_path = tmp.name
    
    if os.name != 'nt': os.chmod(tmp_path, 0o600)
    safe_ssh_path = tmp_path.replace("\\", "/")
    ssh_cmd = f'ssh -i "{safe_ssh_path}" -o StrictHostKeyChecking=no'
    
    try:
        import subprocess
        result = subprocess.run(
            ['git', 'ls-remote', '--heads', url],
            env={**os.environ, 'GIT_SSH_COMMAND': ssh_cmd},
            capture_output=True, text=True, check=True
        )
        branches = []
        for line in result.stdout.splitlines():
            if '\t' in line:
                ref = line.split('\t')[1]
                branches.append(ref.replace('refs/heads/', ''))
        return branches
    finally:
        if os.path.exists(tmp_path):
            try: os.remove(tmp_path)
            except: pass
