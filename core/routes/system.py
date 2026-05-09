import os
import json
import re
from fastapi import APIRouter, Depends, HTTPException, Request, UploadFile, File
from pydantic import BaseModel, constr, validator, Field
from core.config import APP_CONFIG, limiter, SECURITY_LIMITS, BASE_DIR
from core.auth import get_owner_user
from core.database import add_audit_log

router = APIRouter()

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
    if ext not in ['.png', '.ico', '.jpg', '.jpeg', '.svg']:
        raise HTTPException(status_code=400, detail="Invalid file type. Allowed: png, ico, jpg, svg")
    
    # Path to config volume (project root/config)
    config_dir = os.path.join(os.path.dirname(BASE_DIR), "config")
    os.makedirs(config_dir, exist_ok=True)
    
    # Determine filename
    if type == "logo":
        safe_name = f"logo{ext}"
        # Delete other logo files with different extensions to avoid confusion
        for e in ['.png', '.jpg', '.jpeg', '.svg']:
            if e != ext:
                try: os.remove(os.path.join(config_dir, f"logo{e}"))
                except: pass
    elif type == "favicon":
        safe_name = f"favicon{ext}"
        for e in ['.ico', '.png', '.svg']:
            if e != ext:
                try: os.remove(os.path.join(config_dir, f"favicon{e}"))
                except: pass
    else:
        # Secure filename for custom uploads
        safe_name = re.sub(r'[^a-zA-Z0-9.-]', '_', file.filename)
    
    save_path = os.path.join(config_dir, safe_name)
    
    try:
        content = await file.read()
        
        # Security: Sanitize SVG if uploaded as logo/favicon/asset
        if ext == ".svg":
            svg_text = content.decode("utf-8", errors="ignore")
            # Strip scripts
            svg_text = re.sub(r'<script.*?>.*?</script>', '', svg_text, flags=re.DOTALL | re.IGNORECASE)
            # Strip inline handlers (onmouseover, onclick, etc.)
            svg_text = re.sub(r'\son\w+=".*?"', '', svg_text, flags=re.IGNORECASE)
            svg_text = re.sub(r'\son\w+=\'.*?\'', '', svg_text, flags=re.IGNORECASE)
            content = svg_text.encode("utf-8")

        with open(save_path, "wb") as f:
            f.write(content)
            
        # Log the upload
        add_audit_log(
            user["username"], 
            "system_asset_uploaded", 
            f"Type: {type}, File: {safe_name}", 
            ip_address=request.client.host
        )
            
        return {"path": f"/config/{safe_name}"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to upload: {str(e)}")
