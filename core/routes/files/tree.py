import os
from fastapi import APIRouter, Request
from core.database import is_public
from core.auth import get_current_user, ROLES
from core.config import DOCS_DIR, limiter, SECURITY_LIMITS

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
        
    from core.database import list_repositories
    flattened_slugs = [r['slug'] for r in list_repositories() if r.get('flatten_in_tree')]
        
    def has_markdown(path):
        for root, dirs, files in os.walk(path):
            for file in files:
                if file.endswith('.md'):
                    rel_path = os.path.relpath(os.path.join(root, file), DOCS_DIR).replace('\\', '/')
                    if is_public(rel_path) or can_see_private:
                        return True
        return False

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
                # Check if this is a flattened repo at the root level
                if is_root and item in flattened_slugs:
                    # Merge children directly into root
                    nodes.extend(build_tree(full_path))
                    continue

                if not has_markdown(full_path): continue
                children = build_tree(full_path)
                nodes.append({
                    "name": item,
                    "type": "folder",
                    "path": rel_path,
                    "children": children
                })
            elif item.endswith(".md"):
                from core.database import get_file_status
                public = is_public(rel_path)
                status = get_file_status(rel_path)
                if public or can_see_private:
                    nodes.append({
                        "name": item,
                        "type": "file",
                        "path": rel_path,
                        "public": public,
                        "status": status
                    })
        return nodes

    return {"tree": build_tree(DOCS_DIR, is_root=True), "flattened_slugs": flattened_slugs}

@router.get("/folder")
@limiter.limit(SECURITY_LIMITS["file_ops"])
def get_folder_content(path: str, request: Request):
    user = get_current_user(request)
    user_role = user.get("role", "guest") if user else "guest"
    can_see_private = ROLES.get(user_role, 0) >= ROLES.get("reporter", 0)
    
    from .utils import get_safe_path
    from core.config import DOCS_DIR
    full_path = get_safe_path(DOCS_DIR, path)
    
    if not os.path.isdir(full_path):
        from .utils import resolve_flattened_path
        alt_path = resolve_flattened_path(DOCS_DIR, path, request)
        if alt_path and os.path.isdir(alt_path):
            full_path = alt_path
        else:
            from fastapi import HTTPException
            raise HTTPException(status_code=400, detail="Not a folder")
        
    def has_markdown(p):
        for root, dirs, files in os.walk(p):
            for file in files:
                if file.endswith('.md'):
                    rp = os.path.relpath(os.path.join(root, file), DOCS_DIR).replace('\\', '/')
                    if is_public(rp) or can_see_private:
                        return True
        return False

    items = os.listdir(full_path)
    items.sort(key=lambda x: (not os.path.isdir(os.path.join(full_path, x)), x.lower()))
    
    nodes = []
    for item in items:
        if item.startswith('.'): continue
        item_full_path = os.path.join(full_path, item)
        item_rel_path = os.path.relpath(item_full_path, DOCS_DIR).replace('\\', '/')
        
        if os.path.isdir(item_full_path):
            if not has_markdown(item_full_path): continue
            nodes.append({
                "name": item,
                "type": "folder",
                "path": item_rel_path
            })
        elif item.endswith(".md"):
            from core.database import get_file_status
            public = is_public(item_rel_path)
            status = get_file_status(item_rel_path)
            if public or can_see_private:
                nodes.append({
                    "name": item,
                    "type": "file",
                    "path": item_rel_path,
                    "public": public,
                    "status": status
                })
    
    actual_rel_path = os.path.relpath(full_path, DOCS_DIR).replace('\\', '/')
    return {"name": os.path.basename(path) or "Root", "path": actual_rel_path, "items": nodes}
