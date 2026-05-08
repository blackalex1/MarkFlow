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
    
    # Ensure favicon_path is set (no fallback to static as per user request)
    if not res.get("favicon_path"):
        res["favicon_path"] = "/config/favicon.ico"

    if "security_limits" in loaded:
        res["security_limits"] = {**defaults["security_limits"], **loaded["security_limits"]}
    return res

SETTINGS = load_settings()
APP_CONFIG = SETTINGS # For backward compatibility in templates
SECURITY_LIMITS = SETTINGS["security_limits"]

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DOCS_DIR = os.path.join(os.path.dirname(BASE_DIR), "markdown_docs")
