import os
import json
import re
from fastapi import APIRouter, Depends, HTTPException, Request, UploadFile, File
from pydantic import BaseModel, constr, validator, Field
from core.config import APP_CONFIG, limiter, SECURITY_LIMITS, BASE_DIR
from core.auth import get_owner_user, get_developer_user
from core.db.audit import add_audit_log
from core.db.statuses import list_statuses, add_status, update_status, delete_status, get_status_by_slug
from core.db.settings import set_setting
from core.services.image_service import sanitize_and_save_image, cleanup_old_assets
from core.db.stats import get_site_stats, get_top_documents

router = APIRouter()

class StatusUpdate(BaseModel):
    name: str = Field(..., min_length=1, max_length=30)
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
            if not re.match(r'^\d+/(s|m|h|d)$', v):
                raise ValueError('Invalid rate limit format (e.g. 5/minute)')
        return v

class SystemSettings(BaseModel):
    app_name: str = Field(..., min_length=1, max_length=50) 
    primary_color: str
    use_logo: bool
    logo_path: str
    favicon_path: str
    bg_glow_enabled: bool = True
    bg_glow_opacity_light: float = Field(default=0.15, ge=0, le=1.0)
    bg_glow_opacity_dark: float = Field(default=0.05, ge=0, le=1.0)
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
        # Save to DB
        set_setting("app_name", data.app_name)
        set_setting("primary_color", data.primary_color)
        set_setting("use_logo", "true" if data.use_logo else "false")
        set_setting("logo_path", data.logo_path)
        set_setting("favicon_path", data.favicon_path)
        set_setting("bg_glow_enabled", "true" if data.bg_glow_enabled else "false")
        set_setting("bg_glow_opacity_light", str(data.bg_glow_opacity_light))
        set_setting("bg_glow_opacity_dark", str(data.bg_glow_opacity_dark))
        set_setting("max_request_size_mb", str(data.max_request_size_mb))
        
        limits_dict = data.security_limits.dict(by_alias=True)
        set_setting("security_limits", json.dumps(limits_dict))
        
        # Update in-memory config
        APP_CONFIG.update({
            "app_name": data.app_name,
            "primary_color": data.primary_color,
            "use_logo": data.use_logo,
            "logo_path": data.logo_path,
            "favicon_path": data.favicon_path,
            "bg_glow_enabled": data.bg_glow_enabled,
            "bg_glow_opacity_light": data.bg_glow_opacity_light,
            "bg_glow_opacity_dark": data.bg_glow_opacity_dark,
            "max_request_size_mb": data.max_request_size_mb,
            "security_limits": limits_dict
        })
        
        def hex_to_rgb(hex_str):
            hex_str = hex_str.lstrip('#')
            if len(hex_str) == 3: hex_str = ''.join([c*2 for c in hex_str])
            return f"{int(hex_str[0:2], 16)}, {int(hex_str[2:4], 16)}, {int(hex_str[4:6], 16)}"
        
        APP_CONFIG["primary_rgb"] = hex_to_rgb(data.primary_color)
        add_audit_log(user["username"], "system_settings_updated", f"App: {data.app_name}, Color: {data.primary_color}", ip_address=request.client.host)
        return {"message": "Settings updated"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to save settings: {str(e)}")

@router.post("/upload-asset")
@limiter.limit(SECURITY_LIMITS["file_ops"])
async def upload_asset(request: Request, type: str = "custom", file: UploadFile = File(...), user=Depends(get_owner_user)):
    ext = os.path.splitext(file.filename)[1].lower()
    config_dir = os.path.join(os.path.dirname(BASE_DIR), "config")
    
    if type == "logo":
        filename = f"logo{ext}"
        cleanup_old_assets(config_dir, "logo", ext, ['.png', '.jpg', '.jpeg'])
    elif type == "favicon":
        filename = f"favicon{ext}"
        cleanup_old_assets(config_dir, "favicon", ext, ['.ico', '.png'])
    else:
        filename = re.sub(r'[^a-zA-Z0-9.-]', '_', file.filename)
    
    content = await file.read()
    sanitize_and_save_image(content, filename, config_dir)
    add_audit_log(user["username"], "system_asset_uploaded", f"Type: {type}, File: {filename}", ip_address=request.client.host)
    return {"path": f"/config/{filename}"}

@router.get("/statuses")
def get_statuses():
    return list_statuses()

@router.post("/statuses")
def create_status(request: Request, data: StatusUpdate, user=Depends(get_owner_user)):
    if not data.slug:
        data.slug = re.sub(r'[^a-z0-9]', '_', data.name.lower())
    if get_status_by_slug(data.slug):
        raise HTTPException(status_code=400, detail="Status exists")
    if add_status(data.slug, data.name, data.color):
        add_audit_log(user["username"], "status_created", f"Name: {data.name}", ip_address=request.client.host)
        return {"message": "Created"}
    raise HTTPException(status_code=500, detail="Failed")

@router.put("/statuses/{status_id}")
def edit_status(status_id: int, request: Request, data: StatusUpdate, user=Depends(get_owner_user)):
    update_status(status_id, data.name, data.color)
    add_audit_log(user["username"], "status_updated", f"ID: {status_id}", ip_address=request.client.host)
    return {"message": "Updated"}

@router.delete("/statuses/{status_id}")
def remove_status(status_id: int, request: Request, user=Depends(get_owner_user)):
    delete_status(status_id)
    add_audit_log(user["username"], "status_deleted", f"ID: {status_id}", ip_address=request.client.host)
    return {"message": "Deleted"}

@router.get("/stats")
def get_system_stats(days: int = 30, top: int = 10, user=Depends(get_developer_user)):
    """Returns site statistics (developers and above)."""
    return {
        "daily": get_site_stats(days),
        "top_docs": get_top_documents(limit=top)
    }
