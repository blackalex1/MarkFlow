import os
import io
import re
from PIL import Image
from fastapi import HTTPException

def sanitize_and_save_image(content: bytes, filename: str, target_dir: str, max_size_mb: int = 2) -> str:
    """
    Sanitizes an image by re-encoding it using Pillow. 
    Strips metadata and prevents polyglot attacks.
    """
    if len(content) > max_size_mb * 1024 * 1024:
        raise HTTPException(status_code=400, detail=f"File too large (max {max_size_mb}MB)")

    ext = os.path.splitext(filename)[1].lower()
    if ext not in ['.png', '.ico', '.jpg', '.jpeg']:
        raise HTTPException(status_code=400, detail="Invalid file type")

    try:
        # Re-open and save to a new buffer (sanitization)
        img = Image.open(io.BytesIO(content))
        img.verify() # First pass verification
        
        # Second pass: re-open for saving
        img = Image.open(io.BytesIO(content))
        out_buffer = io.BytesIO()
        
        # Map extensions to Pillow formats
        fmt = 'PNG' if ext == '.png' else 'JPEG'
        if ext == '.ico': fmt = 'ICO'
        
        img.save(out_buffer, format=fmt)
        sanitized_content = out_buffer.getvalue()
        
        os.makedirs(target_dir, exist_ok=True)
        save_path = os.path.join(target_dir, filename)
        
        with open(save_path, "wb") as f:
            f.write(sanitized_content)
            
        return save_path
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Invalid or malicious image content: {str(e)}")

def cleanup_old_assets(target_dir: str, prefix: str, keep_ext: str, allowed_exts: list):
    """Deletes files with same prefix but different extensions."""
    for e in allowed_exts:
        if e != keep_ext:
            path = os.path.join(target_dir, f"{prefix}{e}")
            if os.path.exists(path):
                try: os.remove(path)
                except: pass
