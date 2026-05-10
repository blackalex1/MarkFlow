import os
import json
import re
from fastapi import APIRouter, Depends, HTTPException, Request, UploadFile, File
from pydantic import BaseModel, constr, validator, Field
from core.config import APP_CONFIG, limiter, SECURITY_LIMITS, BASE_DIR
from core.auth import get_owner_user
from core.database import (
    add_audit_log, list_statuses, add_status, 
    update_status, delete_status, get_status_by_slug
)

router = APIRouter()

class StatusUpdate(BaseModel):
    name: constr(min_length=1, max_length=30)
    color: str
    slug: str = None

    @validator('color')
    def validate_color(cls, v):
        if not re.match(r'^#(?:[0-9a-fA-F]{3}){1,2}$', v):
            raise ValueError('Invalid Hex color format')
        return v

class SecurityLimits(BaseModel):
    login: str
    verify_2fa: str = Field(default="5/minute", alias="2fa_verify")
    change_password: str = "3/minute"
    create_user: str
    file_ops: str
    search: str

    @validator('*')
    def validate_rate_limit(cls, v):
        if not re.match(r'^\d+/(second|minute|hour|day|month|year)$', v):
            # Also allow short versions if supported by slowapi, but let's stick to explicit for now
            if not re.match(r'^\d+/(s|m|h|d)$', v):
                raise ValueError('Invalid rate limit format (e.g. 5/minute)')
        return v

class SystemSettings(BaseModel):
    app_name: constr(min_length=1, max_length=50) 
    primary_color: str
    use_logo: bool
    logo_path: str
    favicon_path: str
    max_request_size_mb: int = Field(default=10, ge=1, le=500)
    security_limits: SecurityLimits

    @validator('primary_color')
    def validate_color(cls, v):
        if not re.match(r'^#(?:[0-9a-fA-F]{3}){1,2}$', v):
            raise ValueError('Invalid Hex color format')
        return v

    @validator('app_name')
    def sanitize_app_name(cls, v):
        return re.sub(r'<[^>]*?>', '', v).strip()

@router.put("/settings")
@limiter.limit(SECURITY_LIMITS["file_ops"])
def update_system_settings(request: Request, data: SystemSettings, user=Depends(get_owner_user)):
    try:
        from core.db.settings import set_setting
        
        # Save to DB
        set_setting("app_name", data.app_name)
        set_setting("primary_color", data.primary_color)
        set_setting("use_logo", "true" if data.use_logo else "false")
        set_setting("logo_path", data.logo_path)
        set_setting("favicon_path", data.favicon_path)
        set_setting("max_request_size_mb", str(data.max_request_size_mb))
        
        # Convert Pydantic model to dict, respecting aliases
        limits_dict = data.security_limits.dict(by_alias=True)
        set_setting("security_limits", json.dumps(limits_dict))
        
        # Update in-memory config
        APP_CONFIG.update({
            "app_name": data.app_name,
            "primary_color": data.primary_color,
            "use_logo": data.use_logo,
            "logo_path": data.logo_path,
            "favicon_path": data.favicon_path,
            "max_request_size_mb": data.max_request_size_mb,
            "security_limits": limits_dict
        })
        
        # Calculate RGB
        def hex_to_rgb(hex_str):
            hex_str = hex_str.lstrip('#')
            if len(hex_str) == 3: hex_str = ''.join([c*2 for c in hex_str])
            return f"{int(hex_str[0:2], 16)}, {int(hex_str[2:4], 16)}, {int(hex_str[4:6], 16)}"
        
        APP_CONFIG["primary_rgb"] = hex_to_rgb(data.primary_color)
        
        # Log the change
        details = f"App Name: {data.app_name}, Color: {data.primary_color}, Use Logo: {data.use_logo}"
        if data.logo_path: details += f", Logo: {data.logo_path}"
        if data.favicon_path: details += f", Favicon: {data.favicon_path}"
        
        add_audit_log(
            user["username"], 
            "system_settings_updated", 
            details, 
            ip_address=request.client.host
        )
        
        return {"message": "Settings updated successfully"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to save settings: {str(e)}")

@router.post("/upload-asset")
@limiter.limit(SECURITY_LIMITS["file_ops"])
async def upload_asset(request: Request, type: str = "custom", file: UploadFile = File(...), user=Depends(get_owner_user)):
    # Security: allowed extensions
    ext = os.path.splitext(file.filename)[1].lower()
    if ext not in ['.png', '.ico', '.jpg', '.jpeg']:
        raise HTTPException(status_code=400, detail="Invalid file type. Allowed: png, ico, jpg")
    
    # Path to config volume (project root/config)
    config_dir = os.path.join(os.path.dirname(BASE_DIR), "config")
    os.makedirs(config_dir, exist_ok=True)
    
    # Determine filename
    if type == "logo":
        safe_name = f"logo{ext}"
        # Delete other logo files with different extensions to avoid confusion
        for e in ['.png', '.jpg', '.jpeg']:
            if e != ext:
                try: os.remove(os.path.join(config_dir, f"logo{e}"))
                except: pass
    elif type == "favicon":
        safe_name = f"favicon{ext}"
        for e in ['.ico', '.png']:
            if e != ext:
                try: os.remove(os.path.join(config_dir, f"favicon{e}"))
                except: pass
    else:
        # Secure filename for custom uploads
        safe_name = re.sub(r'[^a-zA-Z0-9.-]', '_', file.filename)
    
    save_path = os.path.join(config_dir, safe_name)
    
    try:
        content = await file.read()
        
        # Security: limit size (e.g. 2MB for logos/favicons)
        if len(content) > 2 * 1024 * 1024:
             raise HTTPException(status_code=400, detail="File too large (max 2MB)")

        # Security: Verify and sanitize image content using Pillow
        from PIL import Image
        import io
        try:
            # Re-encoding the image strips metadata and potential polyglot attacks
            img = Image.open(io.BytesIO(content))
            img.verify() # First pass verification
            
            # Second pass: re-open and save to a new buffer (sanitization)
            img = Image.open(io.BytesIO(content))
            out_buffer = io.BytesIO()
            
            # Map extensions to Pillow formats
            fmt = 'PNG' if ext == '.png' else 'JPEG'
            if ext == '.ico': fmt = 'ICO'
            
            img.save(out_buffer, format=fmt)
            sanitized_content = out_buffer.getvalue()
        except Exception as e:
            raise HTTPException(status_code=400, detail=f"Invalid or malicious image content: {str(e)}")

        with open(save_path, "wb") as f:
            f.write(sanitized_content)
            
        # Log the upload
        add_audit_log(
            user["username"], 
            "system_asset_uploaded", 
            f"Type: {type}, File: {safe_name}", 
            ip_address=request.client.host
        )
            
        return {"path": f"/config/{safe_name}"}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to upload: {str(e)}")

@router.get("/statuses")
def get_statuses():
    return list_statuses()

@router.post("/statuses")
def create_status(request: Request, data: StatusUpdate, user=Depends(get_owner_user)):
    if not data.slug:
        data.slug = re.sub(r'[^a-z0-9]', '_', data.name.lower())
    
    # Check if slug exists
    if get_status_by_slug(data.slug):
        raise HTTPException(status_code=400, detail="Status with this ID already exists")
        
    if add_status(data.slug, data.name, data.color):
        add_audit_log(user["username"], "status_created", f"Name: {data.name}, Color: {data.color}", ip_address=request.client.host)
        return {"message": "Status created"}
    raise HTTPException(status_code=500, detail="Failed to create status")

@router.put("/statuses/{status_id}")
def edit_status(status_id: int, request: Request, data: StatusUpdate, user=Depends(get_owner_user)):
    update_status(status_id, data.name, data.color)
    add_audit_log(user["username"], "status_updated", f"ID: {status_id}, Name: {data.name}, Color: {data.color}", ip_address=request.client.host)
    return {"message": "Status updated"}

@router.delete("/statuses/{status_id}")
def remove_status(status_id: int, request: Request, user=Depends(get_owner_user)):
    delete_status(status_id)
    add_audit_log(user["username"], "status_deleted", f"ID: {status_id}", ip_address=request.client.host)
    return {"message": "Status deleted"}
