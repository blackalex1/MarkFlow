import os
from slowapi import Limiter
from slowapi.util import get_remote_address

limiter = Limiter(key_func=get_remote_address)
import json

def load_config():
    branding_dir = os.path.join(os.path.dirname(__file__), "branding")
    example_dir = os.path.join(os.path.dirname(__file__), "branding_example")
    
    config_path = os.path.join(branding_dir, "config.json")
    example_path = os.path.join(example_dir, "config.json")
    
    # Priority 1: User custom config (ignored by git)
    if os.path.exists(config_path):
        with open(config_path, "r", encoding="utf-8") as f:
            return json.load(f)
    
    # Priority 2: Example config (tracked by git)
    if os.path.exists(example_path):
        with open(example_path, "r", encoding="utf-8") as f:
            return json.load(f)
            
    # Priority 3: Hardcoded defaults
    return {"app_name": "MarkFlow", "use_logo": False}

APP_CONFIG = load_config()

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DOCS_DIR = os.path.join(os.path.dirname(BASE_DIR), "markdown_docs")
