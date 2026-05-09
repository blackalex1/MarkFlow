import os
import json
from slowapi import Limiter
from slowapi.util import get_remote_address

limiter = Limiter(key_func=get_remote_address)

def load_settings():
    # 'config' is the mounted volume directory
    config_dir = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "config")
    # 'core/config_example' is the internal fallback
    example_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)), "config_example")
    
    settings_path = os.path.join(config_dir, "settings.json")
    example_path = os.path.join(example_dir, "settings.json")
    
    defaults = {
        "app_name": "MarkFlow",
        "use_logo": False,
        "favicon_path": "",
        "primary_color": "#6366f1",
        "security_limits": {
            "login": "5/minute",
            "2fa_verify": "5/minute",
            "change_password": "3/minute",
            "create_user": "10/minute",
            "file_ops": "60/minute",
            "search": "30/minute"
        }
    }
    
    loaded = {}
    if os.path.exists(settings_path):
        try:
            with open(settings_path, "r", encoding="utf-8") as f:
                loaded = json.load(f)
        except:
            pass
    elif os.path.exists(example_path):
        try:
            with open(example_path, "r", encoding="utf-8") as f:
                loaded = json.load(f)
        except:
            pass

    # Try to load from DB first (Priority)
    db_settings = {}
    try:
        from .db.base import get_db
        conn = get_db()
        cursor = conn.cursor()
        cursor.execute("SELECT key, value FROM settings")
        for row in cursor.fetchall():
            key, val = row['key'], row['value']
            # Try to parse as JSON if it looks like a dict/list
            if val.startswith(('{', '[')):
                try:
                    db_settings[key] = json.loads(val)
                except:
                    db_settings[key] = val
            elif val.lower() == 'true': db_settings[key] = True
            elif val.lower() == 'false': db_settings[key] = False
            else:
                db_settings[key] = val
        conn.close()
    except:
        pass

    # Merge: Defaults < JSON File < DB
    res = {**defaults, **loaded, **db_settings}
    
    def hex_to_rgb(hex_str):
        hex_str = hex_str.lstrip('#')
        if len(hex_str) == 3:
            hex_str = ''.join([c*2 for c in hex_str])
        try:
            return f"{int(hex_str[0:2], 16)}, {int(hex_str[2:4], 16)}, {int(hex_str[4:6], 16)}"
        except:
            return "99, 102, 241" # Fallback to indigo

    res["primary_rgb"] = hex_to_rgb(res.get("primary_color", "#6366f1"))
    if not res.get("favicon_path"):
        res["favicon_path"] = "/config/favicon.ico"
    if not res.get("logo_path"):
        res["logo_path"] = "/config/logo.png"

    # Deep merge for nested dicts if needed
    if "security_limits" in db_settings:
        res["security_limits"] = {**defaults["security_limits"], **db_settings["security_limits"]}
    elif "security_limits" in loaded:
        res["security_limits"] = {**defaults["security_limits"], **loaded["security_limits"]}
        
    return res

SETTINGS = load_settings()
APP_CONFIG = SETTINGS # For backward compatibility in templates
SECURITY_LIMITS = SETTINGS["security_limits"]

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DOCS_DIR = os.path.join(os.path.dirname(BASE_DIR), "markdown_docs")
