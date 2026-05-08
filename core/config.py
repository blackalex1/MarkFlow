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
            
    # Merge with defaults
    res = {**defaults, **loaded}
    
    # Fallback for favicon if the specified file doesn't exist on disk
    if res["favicon_path"]:
        # Check if it starts with /config/ (meaning it's in the mounted volume)
        if res["favicon_path"].startswith("/config/"):
            filename = res["favicon_path"].replace("/config/", "")
            full_path = os.path.join(config_dir, filename)
            if not os.path.exists(full_path):
                # Fallback to internal static favicon if exists, or nothing
                res["favicon_path"] = "/static/favicon.ico"
    else:
        res["favicon_path"] = "/static/favicon.ico"

    if "security_limits" in loaded:
        res["security_limits"] = {**defaults["security_limits"], **loaded["security_limits"]}
    return res

SETTINGS = load_settings()
APP_CONFIG = SETTINGS # For backward compatibility in templates
SECURITY_LIMITS = SETTINGS["security_limits"]

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DOCS_DIR = os.path.join(os.path.dirname(BASE_DIR), "markdown_docs")
