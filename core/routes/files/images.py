import os
import io
import re
import hashlib
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Request, Form
from PIL import Image
from core.database import set_public, add_audit_log, get_db
from core.auth import get_developer_user
from core.config import DOCS_DIR, limiter, SECURITY_LIMITS

router = APIRouter()

def is_git_repo(slug: str) -> bool:
    """Checks if a slug corresponds to a registered Git repository."""
    try:
        conn = get_db()
        cur = conn.cursor()
        cur.execute("SELECT 1 FROM git_repositories WHERE slug = ?", (slug,))
        exists = cur.fetchone() is not None
        conn.close()
        return exists
    except Exception:
        return False

@router.post("/upload-image")
@limiter.limit(SECURITY_LIMITS["file_ops"])
async def upload_image(request: Request, file: UploadFile = File(...), target_path: Optional[str] = Form(None), user=Depends(get_developer_user)):
    """Securely uploads an image or video attachment."""
    ext = os.path.splitext(file.filename)[1].lower()
    image_exts = [".png", ".jpg", ".jpeg", ".gif", ".webp"]
    video_exts = [".mp4", ".webm", ".ogg"]
    
    if ext not in image_exts + video_exts:
        raise HTTPException(status_code=400, detail="Invalid file format")
        
    # Determine save directory
    save_base = "attachments"
    if target_path:
        parts = target_path.strip("/").split("/")
        if len(parts) > 1:
            repo_slug = parts[0]
            if is_git_repo(repo_slug):
                save_base = os.path.join(repo_slug, "attachments")
    
    attachments_dir = os.path.join(DOCS_DIR, save_base)
    os.makedirs(attachments_dir, exist_ok=True)
    
    content = await file.read()
    if len(content) > 10 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="File too large (max 10MB)")

    # 1. Validation and Sanitization
    try:
        if ext in image_exts:
            try:
                img = Image.open(io.BytesIO(content))
                img.verify()
                img = Image.open(io.BytesIO(content))
                output = io.BytesIO()
                if img.mode in ("RGBA", "P"):
                    img = img.convert("RGBA")
                else:
                    img = img.convert("RGB")
                
                img_format = img.format if img.format else "PNG"
                img.save(output, format=img_format)
                content = output.getvalue()
            except Exception:
                raise HTTPException(status_code=400, detail="Invalid or malicious image file")
        
        elif ext in video_exts:
            import subprocess
            import tempfile
            with tempfile.NamedTemporaryFile(suffix=ext, delete=False) as tmp:
                tmp.write(content)
                tmp_path = tmp.name
            try:
                result = subprocess.run(
                    ['ffprobe', '-v', 'error', '-show_format', '-show_streams', tmp_path],
                    capture_output=True, text=True, timeout=10
                )
                if result.returncode != 0:
                    raise HTTPException(status_code=400, detail="Invalid or corrupted video file")
            finally:
                if os.path.exists(tmp_path):
                    os.remove(tmp_path)
    except HTTPException as he:
        raise he
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Validation failed: {str(e)}")

    # 2. Hash calculation
    file_hash = hashlib.sha256(content).hexdigest()
    filename = f"{file_hash}{ext}"
    rel_path = os.path.join(save_base, filename).replace("\\", "/")
    full_path = os.path.join(attachments_dir, filename)
    
    # 3. Duplicate check
    if os.path.exists(full_path):
        return {"path": rel_path, "url": f"/api/files/content?path={rel_path}"}
    
    # 4. Save
    try:
        with open(full_path, "wb") as buffer:
            buffer.write(content)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Save failed: {str(e)}")
        
    set_public(rel_path, True)
    add_audit_log(user["username"], "attachment_uploaded", f"Path: {rel_path}", ip_address=request.client.host)
    return {"path": rel_path, "url": f"/api/files/content?path={rel_path}"}
