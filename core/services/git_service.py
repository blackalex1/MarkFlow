import os
import re
import shlex
from datetime import datetime
from git import Repo, InvalidGitRepositoryError, GitCommandError
from core.database import get_setting, set_setting, add_audit_log, reindex_all_docs, get_active_repository, get_db
from core.config import DOCS_DIR, BASE_DIR

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



def sync_repository(username: str, force: bool = False, ip_address: str = "", is_auto: bool = False):
    active_repo = get_active_repository(include_secrets=True)
    if not active_repo:
        return {"message": "No active repository configured."}
    return _sync_repository_internal(active_repo, username, force, ip_address, is_auto)

def _sync_repository_internal(active_repo: dict, username: str, force: bool = False, ip_address: str = "", is_auto: bool = True):
    add_audit_log(username, "git_sync_start", f"Force: {force}, Repo: {active_repo['name']}", ip_address=ip_address)
    
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
        # Defence in Depth: Validate slug again
        if not re.match(r"^[a-z0-9_\-]+$", repo_slug):
             raise Exception(f"Invalid repository slug: {repo_slug}")
             
        Git().config("--global", "--add", "safe.directory", target_dir.replace('\\', '/'))
        
        repo = None
        try:
            repo = Repo(target_dir)
        except:
            repo = Repo.init(target_dir)

        url = active_repo['url']
        validate_git_url(url)
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
            if priv_key:
                from core.db.crypto import decrypt_value
                priv_key = decrypt_value(priv_key)
        
        if not priv_key:
            raise Exception("Neither repository-specific nor global SSH private key found.")

        # Strict sanitization: find PEM boundaries and keep only what's inside
        priv_key = priv_key.strip()
        match = re.search(r'(-----BEGIN.*?-----.*?-----END.*?-----)', priv_key, re.DOTALL)
        if match:
            priv_key = match.group(1)
        
        priv_key = priv_key.replace('\r\n', '\n') + '\n'
        
        import tempfile
        # Use mode 'wb' and write encoded bytes directly
        with tempfile.NamedTemporaryFile(mode='wb', delete=False) as tmp:
            tmp.write(priv_key.encode('utf-8'))
            tmp_path = tmp.name
        
        if os.name != 'nt':
            os.chmod(tmp_path, 0o600)
        safe_tmp_path = tmp_path.replace("\\", "/")
        quoted_path = shlex.quote(safe_tmp_path)
        # Ensure config dir exists for known_hosts
        config_dir = os.path.join(os.path.dirname(BASE_DIR), "config")
        if not os.path.exists(config_dir): os.makedirs(config_dir)
        
        ssh_cmd = f'ssh -i {quoted_path} -o IdentitiesOnly=yes -o StrictHostKeyChecking=accept-new -o UserKnownHostsFile={shlex.quote(os.path.join(config_dir, "known_hosts"))}'

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

                strategy = active_repo.get('sync_strategy', 'rebase')
                
                if force or strategy == 'force':
                    repo.git.fetch('origin')
                    try:
                        repo.git.checkout(branch_name)
                    except:
                        repo.git.checkout('-b', branch_name)
                    
                    repo.git.reset('--hard', f'origin/{branch_name}')
                    repo.git.clean('-fd')
                    add_audit_log(username, "git_force_sync_success", f"Strategy: {strategy}", ip_address=ip_address)
                elif strategy == 'pr':
                    # Push local changes to a NEW unique branch
                    import time
                    timestamp = int(time.time())
                    pr_branch = f"auto-sync-{timestamp}"
                    
                    repo.git.checkout('-b', pr_branch)
                    repo.git.add(A=True)
                    if repo.is_dirty() or repo.untracked_files:
                        prefix = "Auto-sync" if is_auto else "Manual sync"
                        repo.index.commit(f"{prefix} PR branch by {username} via MarkFlow")
                        repo.git.push('origin', pr_branch)
                        add_audit_log(username, "git_sync_pr_pushed", f"Branch: {pr_branch}", ip_address=ip_address)
                    
                    # Return to original branch
                    try: repo.git.checkout(branch_name)
                    except: pass
                else:
                    # Regular Sync or Rebase
                    try:
                        repo.config_writer().set_value("user", "name", "MarkFlow AutoSync").release()
                        repo.config_writer().set_value("user", "email", "sync@markflow.local").release()
                    except: pass
                    
                    repo.git.fetch('origin')
                    
                    # Ensure we are on the correct branch
                    try:
                        repo.git.checkout(branch_name)
                    except:
                        try: repo.git.checkout('-b', branch_name)
                        except: pass

                    # 1. Commit local changes first
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
                        repo.index.commit("Initial commit via MarkFlow")
                        try: repo.git.branch('-M', branch_name)
                        except: pass
                    elif repo.index.diff("HEAD") or repo.untracked_files or repo.is_dirty():
                        prefix = "Auto-sync" if is_auto else "Manual sync"
                        repo.index.commit(f"{prefix} by {username} via MarkFlow ({strategy})")
                    
                    # 2. Pull with strategy
                    if strategy == 'rebase':
                        try:
                            repo.git.pull('origin', branch_name, '--rebase')
                        except Exception as e:
                            try: repo.git.rebase('--abort')
                            except: pass
                            raise Exception(f"Rebase conflict detected: {str(e)}. Please resolve manually or use 'PR Style' strategy.")
                    else:
                        repo.git.pull('origin', branch_name, '--no-rebase', '--allow-unrelated-histories')
                    
                    # 3. Push
                    repo.git.push('origin', branch_name)
                    add_audit_log(username, "git_sync_success", f"Strategy: {strategy}", ip_address=ip_address)
        finally:
            if os.path.exists(tmp_path): os.remove(tmp_path)
        
        reindex_all_docs(DOCS_DIR)
        update_sync_status('success')
        return {"message": "Sync successful"}
    except Exception as e:
        error_msg = str(e)
        # Truncate long error messages for logs
        update_sync_status('error', error_msg[:500])
        raise e

def validate_git_url(url: str):
    """Validate Git URL to prevent SSRF and other injection attacks."""
    if not url:
        raise Exception("Git URL is required")
    
    # 1. Basic Protocol & Injection Checks (from git_sync)
    if url.startswith("-"):
        raise Exception("Invalid Git URL: cannot start with a hyphen")
    if re.search(r"[\s;`\"'|&<>]", url):
        raise Exception("Invalid Git URL: illegal characters detected")
    if not (url.startswith("https://") or url.startswith("git@") or url.startswith("ssh://")):
        raise Exception("Invalid Git URL: protocol not allowed. Use HTTPS or SSH.")
    
    # Block argument injection in ssh:// urls
    if url.startswith("ssh://") and url[6:].startswith("-"):
         raise Exception("Invalid Git URL: argument injection detected")

    # 2. SSRF Protection via DNS/IP checks
    import socket
    import ipaddress
    from urllib.parse import urlparse
    
    hostname = None
    if url.startswith("git@"):
        hostname = url.split("@")[-1].split(":")[0]
    elif "://" in url:
        parsed = urlparse(url)
        hostname = parsed.hostname
    else:
        hostname = url.split(":")[0]

    if not hostname:
        raise Exception(f"Could not extract hostname from URL: {url}")

    blocked_patterns = [r'169\.254\.', r'metadata\.google\.internal']
    for pattern in blocked_patterns:
        if re.search(pattern, url):
            raise Exception(f"Invalid Git URL: Potential metadata service access blocked.")

    try:
        addr_info = socket.getaddrinfo(hostname, None)
        for info in addr_info:
            ip_str = info[4][0]
            ip = ipaddress.ip_address(ip_str)
            
            if ip.is_private or ip.is_loopback or ip.is_link_local or ip.is_multicast or ip.is_unspecified:
                raise Exception(f"Invalid Git URL: Access to private/local network ({ip_str}) is blocked.")
                
            if hasattr(ip, 'ipv4_mapped') and ip.ipv4_mapped:
                if ip.ipv4_mapped.is_private:
                     raise Exception(f"Invalid Git URL: Access to private network (via IPv6 mapped) is blocked.")
    except socket.gaierror:
        # Fail-closed: do not allow unresolvable hostnames in production
        raise Exception(f"Invalid Git URL: Could not resolve hostname '{hostname}'.")
    except Exception as e:
        if "blocked" in str(e): raise e
        raise Exception(f"Git URL validation failed: {str(e)}")

def get_remote_branches_list(repo_data: dict):
    url = repo_data['url']
    validate_git_url(url)
    
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
    
    # Strict sanitization: find PEM boundaries and keep only what's inside
    priv_key = priv_key.strip()
    match = re.search(r'(-----BEGIN.*?-----.*?-----END.*?-----)', priv_key, re.DOTALL)
    if match:
        priv_key = match.group(1)
        
    priv_key = priv_key.replace('\r\n', '\n') + '\n'
    
    import tempfile
    # Use mode 'wb' and write encoded bytes directly
    with tempfile.NamedTemporaryFile(mode='wb', delete=False) as tmp:
        tmp.write(priv_key.encode('utf-8'))
        tmp_path = tmp.name
    
    if os.name != 'nt':
        os.chmod(tmp_path, 0o600)
    safe_ssh_path = tmp_path.replace("\\", "/")
    quoted_path = shlex.quote(safe_ssh_path)
    # Ensure config dir exists for known_hosts
    config_dir = os.path.join(os.path.dirname(BASE_DIR), "config")
    if not os.path.exists(config_dir): os.makedirs(config_dir)
    
    ssh_cmd = f'ssh -i {quoted_path} -o IdentitiesOnly=yes -o StrictHostKeyChecking=accept-new -o UserKnownHostsFile={shlex.quote(os.path.join(config_dir, "known_hosts"))}'
    
    try:
        import subprocess
        # Use '--' to separate arguments from the URL to prevent argument injection
        result = subprocess.run(
            ['git', 'ls-remote', '--heads', '--', url],
            env={**os.environ, 'GIT_SSH_COMMAND': ssh_cmd},
            capture_output=True, text=True, check=True
        )
        branches = []
        for line in result.stdout.splitlines():
            if '\t' in line:
                ref = line.split('\t')[1]
                branches.append(ref.replace('refs/heads/', ''))
        return branches
    except subprocess.CalledProcessError as e:
        print(f"DEBUG: Git ls-remote failed for {url}")
        print(f"STDOUT: {e.stdout}")
        print(f"STDERR: {e.stderr}")
        raise Exception(f"Git remote check failed: {e.stderr or e.stdout or str(e)}")
    finally:
        if os.path.exists(tmp_path):
            try: os.remove(tmp_path)
            except: pass

async def start_background_sync_worker():
    """Background task that periodically syncs repositories with auto-sync enabled."""
    import asyncio
    from datetime import datetime, timedelta
    
    print("Git background worker starting...")
    while True:
        try:
            conn = get_db()
            cursor = conn.cursor()
            # Only get repos that have auto_sync enabled
            cursor.execute('''
                SELECT * FROM git_repositories 
                WHERE auto_sync_interval > 0
            ''')
            repos = [dict(row) for row in cursor.fetchall()]
            conn.close()

            if not repos:
                # No repos with auto-sync, wait longer before checking again
                await asyncio.sleep(60)
                continue

            for repo in repos:
                interval = repo['auto_sync_interval']
                last_sync = repo.get('last_auto_sync_at')
                
                should_sync = False
                if not last_sync:
                    should_sync = True
                else:
                    last_sync_dt = datetime.fromisoformat(last_sync)
                    if datetime.now() - last_sync_dt >= timedelta(minutes=interval):
                        should_sync = True
                
                if should_sync:
                    print(f"Background sync triggered for repo: {repo['name']} (Strategy: {repo['sync_strategy']})")
                    try:
                        await asyncio.to_thread(sync_repository_by_id, repo['id'], "System")
                        
                        # Update last_auto_sync_at
                        conn = get_db()
                        cur = conn.cursor()
                        cur.execute("UPDATE git_repositories SET last_auto_sync_at = ? WHERE id = ?", 
                                    (datetime.now().isoformat(), repo['id']))
                        conn.commit()
                        conn.close()
                    except Exception as e:
                        print(f"Background sync failed for {repo['name']}: {e}")

        except Exception as e:
            print(f"Background worker error: {e}")
            
        await asyncio.sleep(60)

def sync_repository_by_id(repo_id: int, username: str):
    """Wrapper for sync_repository that targets a specific repo."""
    from core.database import get_repository
    repo = get_repository(repo_id, include_secrets=True)
    if not repo: return
    
    # Call the main sync logic with this repo
    return _sync_repository_internal(repo, username)

