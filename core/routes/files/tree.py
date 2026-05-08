import os
from fastapi import APIRouter, Request
from core.database import is_public
from core.auth import get_current_user, ROLES
from core.config import DOCS_DIR, limiter
from core.security_config import SECURITY_LIMITS

router = APIRouter()

@router.get("/tree")
@limiter.limit(SECURITY_LIMITS["file_ops"])
def get_file_tree(request: Request):
    user = get_current_user(request)
    user_role = user.get("role", "guest") if user else "guest"
    can_see_private = ROLES.get(user_role, 0) >= ROLES.get("reporter", 0)
    is_staff = ROLES.get(user_role, 0) >= ROLES.get("maintainer", 0)
    
    if not os.path.exists(DOCS_DIR):
        os.makedirs(DOCS_DIR)
        
    def build_tree(path):
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
                children = build_tree(full_path)
                if children or is_staff:
                    nodes.append({
                        "name": item,
                        "type": "folder",
                        "children": children
                    })
            elif item.endswith(".md"):
                public = is_public(rel_path)
                if public or can_see_private:
                    nodes.append({
                        "name": item,
                        "type": "file",
                        "path": rel_path,
                        "public": public
                    })
        return nodes

    return {"tree": build_tree(DOCS_DIR)}
