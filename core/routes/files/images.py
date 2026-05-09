import os
import uuid
import io
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Request
from PIL import Image
from core.database import set_public, add_audit_log
from core.auth import get_developer_user
from core.config import DOCS_DIR, limiter, SECURITY_LIMITS

router = APIRouter()

@router.post("/upload-image")
@limiter.limit(SECURITY_LIMITS["file_ops"])
async def upload_image(request: Request, file: UploadFile = File(...), user=Depends(get_developer_user)):
    """Securely uploads an image or video attachment."""
    ext = os.path.splitext(file.filename)[1].lower()
    image_exts = [".png", ".jpg", ".jpeg", ".gif", ".webp", ".svg"]
    video_exts = [".mp4", ".webm", ".ogg"]
    
    if ext not in image_exts + video_exts:
        raise HTTPException(status_code=400, detail="Invalid file format")
        
    attachments_dir = os.path.join(DOCS_DIR, "attachments")
    os.makedirs(attachments_dir, exist_ok=True)
    
    content = await file.read()
    if len(content) > 10 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="File too large (max 10MB)")

    # 1. Validation and Sanitization
    try:
        if ext in image_exts:
            if ext == ".svg":
                svg_text = content.decode("utf-8", errors="ignore")
                import re
                svg_text = re.sub(r'<script.*?>.*?</script>', '', svg_text, flags=re.DOTALL | re.IGNORECASE)
                svg_text = re.sub(r'\son\w+=".*?"', '', svg_text, flags=re.IGNORECASE)
                svg_text = re.sub(r'\son\w+=\'.*?\'', '', svg_text, flags=re.IGNORECASE)
                content = svg_text.encode("utf-8")
            else:
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
                    capture_output=True, text=True
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

    # 2. Hash calculation on PROCESSED content for deduplication
    import hashlib
    file_hash = hashlib.sha256(content).hexdigest()
    filename = f"{file_hash}{ext}"
    rel_path = f"attachments/{filename}"
    full_path = os.path.join(attachments_dir, filename)
    
    # 3. Duplicate check
    if os.path.exists(full_path):
        return {"path": rel_path, "url": f"/api/files/content?path={rel_path}"}
    
    # 4. Save final sanitized file
    try:
        with open(full_path, "wb") as buffer:
            buffer.write(content)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Save failed: {str(e)}")
        
    set_public(rel_path, True)
    add_audit_log(user["username"], "attachment_uploaded", f"Path: {rel_path}", ip_address=request.client.host)
    return {"path": rel_path, "url": f"/api/files/content?path={rel_path}"}
