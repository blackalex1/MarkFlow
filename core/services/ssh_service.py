import os
import subprocess
import tempfile
from core.database import set_setting, get_setting, add_audit_log

def generate_ssh_key(username: str, ip_address: str = ""):
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
            
            set_setting("git_ssh_private_key", priv)
            set_setting("git_ssh_public_key", pub)
            
        add_audit_log(username, "git_ssh_key_generated", ip_address=ip_address)
        return {"message": "SSH key generated", "pubkey": pub}
    except Exception as e:
        raise Exception(f"Failed to generate SSH key: {str(e)}")

def save_ssh_key(username: str, priv: str, pub: str, ip_address: str = ""):
    set_setting("git_ssh_private_key", priv)
    set_setting("git_ssh_public_key", pub)
    add_audit_log(username, "git_ssh_key_manually_set", ip_address=ip_address)
    return {"message": "SSH key saved to database"}
