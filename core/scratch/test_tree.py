import os
import sys

# Add project root to sys.path
PROJECT_ROOT = r'c:\Users\black\PycharmProjects\Gleb'
sys.path.append(PROJECT_ROOT)

from core.config import DOCS_DIR
from core.database import list_repositories

flattened_slugs = [r['slug'] for r in list_repositories() if r.get('flatten_in_tree')]
print(f"Flattened slugs: {flattened_slugs}")

def is_public(path): return True # Mock

def build_tree(path, is_root=False):
    nodes = []
    try:
        items = os.listdir(path)
    except OSError:
        return nodes
        
    items.sort(key=lambda x: (not os.path.isdir(os.path.join(path, x)), x.lower()))
    
    for item in items:
        if item.startswith('.'): continue
        
        full_path = os.path.join(path, item)
        rel_path = os.path.relpath(full_path, DOCS_DIR).replace('\\', '/')
        
        if os.path.isdir(full_path):
            if is_root and item in flattened_slugs:
                nodes.extend(build_tree(full_path))
                continue

            children = build_tree(full_path)
            nodes.append({
                "name": item,
                "type": "folder",
                "path": rel_path,
                "children": children
            })
        elif item.endswith(".md"):
            nodes.append({
                "name": item,
                "type": "file",
                "path": rel_path
            })
    return nodes

tree = build_tree(DOCS_DIR, is_root=True)
import json
print(json.dumps(tree, indent=2))
