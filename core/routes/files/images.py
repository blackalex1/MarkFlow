import os
import uuid
import io
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Request
from PIL import Image
from core.database import set_public, add_audit_log
from core.auth import get_developer_user
from core.config import DOCS_DIR, limiter
from core.security_config import SECURITY_LIMITS

router = APIRouter()

@router.post("/upload-image")
@limiter.limit(SECURITY_LIMITS["file_ops"])
async def upload_image(request: Request, file: UploadFile = File(...), user=Depends(get_developer_user)):
    ext = os.path.splitext(file.filename)[1].lower()
    if ext not in [".png", ".jpg", ".jpeg", ".gif", ".webp", ".svg"]:
        raise HTTPException(status_code=400, detail="Invalid image format")
        
    attachments_dir = os.path.join(DOCS_DIR, "attachments")
    os.makedirs(attachments_dir, exist_ok=True)
    
    filename = f"{uuid.uuid4()}{ext}"
    rel_path = f"attachments/{filename}"
    full_path = os.path.join(attachments_dir, filename)
    
    try:
        content = await file.read()
        try:
            img = Image.open(io.BytesIO(content))
            output = io.BytesIO()
            if img.mode in ("RGBA", "P"):
                img = img.convert("RGBA")
            img.save(output, format=img.format if img.format else "PNG")
            content = output.getvalue()
        except Exception:
            raise HTTPException(status_code=400, detail="Invalid or malicious image file")

        with open(full_path, "wb") as buffer:
            buffer.write(content)
    except HTTPException as he:
        raise he
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
        
    set_public(rel_path, True)
    add_audit_log(user["username"], "image_uploaded", f"Path: {rel_path}")
    return {"path": rel_path, "url": f"/api/files/content?path={rel_path}"}
