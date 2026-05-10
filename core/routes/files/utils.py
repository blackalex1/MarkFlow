import os
import re
from fastapi import HTTPException

def get_safe_path(base_dir: str, user_path: str) -> str:
    """Safely join paths and validate characters to prevent attacks and OS errors."""
    # 1. Block illegal characters (especially for Windows compatibility)
    # Characters: < > : " | ? *
    if re.search(r'[<>:"|?*]', user_path):
        raise HTTPException(status_code=400, detail="Invalid path: Illegal characters detected")
    
    # 2. Prevent Directory Traversal
    safe_user_path = user_path.lstrip("/\\")
    full_path = os.path.abspath(os.path.join(base_dir, safe_user_path))
    expected_base = os.path.abspath(base_dir)
    if not full_path.startswith(expected_base + os.sep) and full_path != expected_base:
        raise HTTPException(status_code=400, detail="Invalid path: Traversal detected")
    return full_path
