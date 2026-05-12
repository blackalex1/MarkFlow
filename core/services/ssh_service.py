import os
import subprocess
import tempfile
from core.database import set_setting, get_setting, add_audit_log, get_active_repository, update_repository, encrypt_value

def generate_ssh_key(username: str, ip_address: str = ""):
    active_repo = get_active_repository()
    if not active_repo:
        raise Exception("No active repository to generate key for.")
        
    try:
        with tempfile.TemporaryDirectory() as tmpdir:
            tmp_key_path = os.path.join(tmpdir, "id_rsa")
            subprocess.run([
                "ssh-keygen", "-t", "rsa", "-b", "4096", "-m", "PEM",
                "-f", tmp_key_path, "-N", "", "-q"
            ], check=True)
            
            with open(tmp_key_path, "r") as f:
                priv = f.read()
            with open(tmp_key_path + ".pub", "r") as f:
                pub = f.read()
            
            update_repository(
                active_repo['id'], active_repo['name'], active_repo['slug'], 
                active_repo['url'], active_repo['branch'], 
                priv, pub
            )
            
        add_audit_log(username, "git_ssh_key_generated", f"Repo: {active_repo['name']}", ip_address=ip_address)
        return {"message": "SSH key generated and assigned to active repo", "pubkey": pub}
    except FileNotFoundError:
        raise Exception("ssh-keygen not found in system PATH. Please ensure Git for Windows is installed.")
    except Exception as e:
        raise Exception(f"Failed to generate SSH key: {str(e)}")

def save_ssh_key(username: str, priv: str, pub: str, ip_address: str = ""):
    active_repo = get_active_repository()
    if not active_repo:
        raise Exception("No active repository to save key for.")
        
    update_repository(
        active_repo['id'], active_repo['name'], active_repo['slug'], 
        active_repo['url'], active_repo['branch'], 
        priv, pub
    )
    add_audit_log(username, "git_ssh_key_manually_set", f"Repo: {active_repo['name']}", ip_address=ip_address)
    return {"message": "SSH key saved to active repository"}

def generate_global_ssh_key(username: str, ip_address: str = ""):
    """Generates a new global SSH key pair and saves it to system settings."""
    try:
        priv, pub = generate_key_pair()
        set_setting('git_ssh_private_key', encrypt_value(priv))
        set_setting('git_ssh_public_key', pub)
        
        add_audit_log(username, "system_ssh_key_generated", "Global SSH key pair regenerated", ip_address=ip_address)
        return {"message": "Global SSH key pair regenerated", "pubkey": pub}
    except Exception as e:
        raise Exception(f"Failed to generate global SSH key: {str(e)}")

def save_global_ssh_key(username: str, priv: str, pub: str, ip_address: str = ""):
    """Manually saves a global SSH key pair to system settings."""
    set_setting('git_ssh_private_key', encrypt_value(priv))
    set_setting('git_ssh_public_key', pub)
    
    add_audit_log(username, "system_ssh_key_manually_set", "Global SSH key pair manually updated", ip_address=ip_address)
    return {"message": "Global SSH key pair saved"}

def generate_key_pair():
    """Generates an RSA key pair in PEM format and returns (private_key, public_key)"""
    try:
        with tempfile.TemporaryDirectory() as tmpdir:
            tmp_key_path = os.path.join(tmpdir, "id_rsa")
            # Using rsa for broad compatibility
            subprocess.run([
                "ssh-keygen", "-t", "rsa", "-b", "4096", "-m", "PEM",
                "-f", tmp_key_path, "-N", "", "-q"
            ], check=True)
            
            with open(tmp_key_path, "r") as f:
                priv = f.read()
            with open(tmp_key_path + ".pub", "r") as f:
                pub = f.read()
                
            return priv, pub
    except FileNotFoundError:
        raise Exception("ssh-keygen not found in system PATH. Please ensure Git for Windows is installed.")
    except Exception as e:
        raise Exception(f"Failed to generate key pair: {str(e)}")
