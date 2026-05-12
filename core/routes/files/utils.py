import os
import re
from fastapi import HTTPException, Request

def get_safe_path(base_dir: str, user_path: str) -> str:
    """Safely join paths and validate characters to prevent attacks and OS errors."""
    # 1. Block illegal characters (especially for Windows compatibility)
    # Characters: < > : " | ? *
    if re.search(r'[<>:"|?*]', user_path):
        raise HTTPException(status_code=400, detail="Invalid path: Illegal characters detected")
    
    # 2. Prevent Directory Traversal
    safe_user_path = user_path.lstrip("/\\")
    full_path = os.path.abspath(os.path.join(base_dir, safe_user_path))
    expected_base = os.path.abspath(base_dir)
    if not full_path.startswith(expected_base + os.sep) and full_path != expected_base:
        raise HTTPException(status_code=400, detail="Invalid path: Traversal detected")
    return full_path

def get_flattened_path_map(base_dir: str):
    """
    Builds a map of {root_item_name: repo_slug} for all flattened repositories.
    This allows O(1) resolution of flattened paths.
    """
    from core.db.repos import list_repositories
    path_map = {}
    repos = [r for r in list_repositories() if r.get('flatten_in_tree')]
    
    for repo in repos:
        slug = repo['slug']
        repo_path = os.path.join(base_dir, slug)
        if os.path.isdir(repo_path):
            try:
                for item in os.listdir(repo_path):
                    if not item.startswith('.'):
                        path_map[item] = slug
            except OSError:
                continue
    return path_map

def resolve_flattened_path(base_dir: str, path: str, request: Request = None):
    """
    Smartly resolves a path by trying several heuristics:
    1. Prepending the slug of the referring document.
    2. Finding a suffix of the path that exists in the referring repo (fixes duplicated paths).
    3. Finding a suffix of the path that exists globally (cross-repo links).
    4. Fallback to flattened map for O(1) lookup.
    """
    if not path:
        return None
    
    ref_slug = None
    if request:
        referer = request.headers.get("Referer")
        if referer:
            from urllib.parse import urlparse, parse_qs
            try:
                parsed = urlparse(referer)
                qs = parse_qs(parsed.query)
                p_val = qs.get('p', [None])[0]
                if p_val:
                    ref_slug = p_val.split('/')[0]
            except Exception: pass
    
    # Fallback: if we can't get slug from referer, try the first segment of the path itself
    if not ref_slug and path:
        ref_slug = path.split('/')[0]

    # 1. Try prepending ref_slug (if not already there)
    if ref_slug and not path.startswith(ref_slug + '/'):
        alt_path = get_safe_path(base_dir, os.path.join(ref_slug, path))
        if os.path.exists(alt_path):
            return alt_path

    # 2. Suffix matching (Fixes "folder/folder/file.md" issues)
    parts = path.split('/')
    for i in range(len(parts)):
        sub_path = '/'.join(parts[i:])
        if not sub_path: continue
        
        # Try relative to ref_slug
        if ref_slug:
            candidate = os.path.join(base_dir, ref_slug, sub_path)
            if os.path.exists(candidate):
                return get_safe_path(base_dir, os.path.join(ref_slug, sub_path))
        
        # Try relative to root (Global cross-repo search)
        candidate = os.path.join(base_dir, sub_path)
        if os.path.exists(candidate):
            return get_safe_path(base_dir, sub_path)

    # 3. Fallback to Map-based lookup for flattened items
    first_part = parts[0]
    path_map = get_flattened_path_map(base_dir)
    if first_part in path_map:
        slug = path_map[first_part]
        return get_safe_path(base_dir, os.path.join(slug, path))
    
    return None
