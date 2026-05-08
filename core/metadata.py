import json
import os
import threading

DOCS_DIR = os.path.join(os.path.dirname(os.path.dirname(__file__)), "markdown_docs")
METADATA_PATH = os.path.join(DOCS_DIR, "metadata.json")

metadata_lock = threading.Lock()

def get_metadata():
    with metadata_lock:
        if not os.path.exists(METADATA_PATH):
            return {}
        try:
            with open(METADATA_PATH, 'r', encoding='utf-8') as f:
                return json.load(f)
        except json.JSONDecodeError:
            return {}

def save_metadata(data):
    with metadata_lock:
        with open(METADATA_PATH, 'w', encoding='utf-8') as f:
            json.dump(data, f, indent=4, ensure_ascii=False)

def is_public(filepath: str) -> bool:
    """Returns True if file is public, False if private (admin-only)"""
    # Normalize path to use forward slashes
    filepath = filepath.replace('\\', '/')
    
    # Attachments are always public
    if filepath.startswith("attachments/"):
        return True
        
    data = get_metadata()
    return data.get(filepath, {}).get("public", False)

def set_public(filepath: str, public: bool):
    data = get_metadata()
    filepath = filepath.replace('\\', '/')
    if filepath not in data:
        data[filepath] = {}
    data[filepath]["public"] = public
    save_metadata(data)

def rename_metadata(old_path: str, new_path: str):
    """Updates metadata keys when a file or folder is renamed/moved."""
    data = get_metadata()
    old_path = old_path.replace('\\', '/')
    new_path = new_path.replace('\\', '/')
    
    updated = False
    # If it's a folder, we need to update all nested paths
    to_delete = []
    to_add = {}
    
    for path in data.keys():
        if path == old_path:
            to_delete.append(path)
            to_add[new_path] = data[path]
            updated = True
        elif path.startswith(old_path + "/"):
            to_delete.append(path)
            suffix = path[len(old_path):]
            to_add[new_path + suffix] = data[path]
            updated = True
            
    for path in to_delete:
        del data[path]
    data.update(to_add)
    
    if updated:
        save_metadata(data)
