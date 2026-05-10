import base64
import os
from cryptography.fernet import Fernet
from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.kdf.pbkdf2 import PBKDF2HMAC
from .settings import get_setting

_fernet = None

def get_cipher():
    global _fernet
    if _fernet:
        return _fernet
    
    secret = get_setting('ENCRYPTION_SECRET')
    salt_str = get_setting('ENCRYPTION_SALT')
    
    if not secret or not salt_str:
        raise RuntimeError("Encryption not fully initialized. ENCRYPTION_SECRET or ENCRYPTION_SALT missing in database.")
    
    # Derive a key from the secret and the dynamic salt
    salt = salt_str.encode()
    kdf = PBKDF2HMAC(
        algorithm=hashes.SHA256(),
        length=32,
        salt=salt,
        iterations=100000,
    )
    key = base64.urlsafe_b64encode(kdf.derive(secret.encode()))
    _fernet = Fernet(key)
    return _fernet

def encrypt_value(value: str) -> str:
    if not value: return value
    f = get_cipher()
    return f.encrypt(value.encode()).decode()

def decrypt_value(value: str) -> str:
    if not value: return value
    try:
        f = get_cipher()
        return f.decrypt(value.encode()).decode()
    except Exception as e:
        # Do NOT return the original value on failure, as it might be sensitive
        raise ValueError(f"Decryption failed: {str(e)}")
