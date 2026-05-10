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
    if not secret:
        raise RuntimeError("ENCRYPTION_SECRET not found in database. Encryption is not initialized.")
    
    # Derive a key from the secret
    salt = b'markflow_static_salt' # In a real app, salt should be unique and stored, but for our case we use the secret as the main entropy
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
    # If it's not encrypted (e.g. legacy data), return as is
    # Fernet tokens start with 'gAAAAA'
    if not value.startswith('gAAAA'):
        return value
    
    try:
        f = get_cipher()
        return f.decrypt(value.encode()).decode()
    except Exception as e:
        # Do NOT return the original value on failure, as it might be sensitive
        raise ValueError(f"Decryption failed: {str(e)}")
