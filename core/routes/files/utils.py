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
    from core.database import list_repositories
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
    Efficiently resolves a path that might be missing a slug due to flattening.
    Uses Referer header to handle collisions between repositories.
    """
    if not path:
        return None
    
    # 1. Try to get context from Referer (Best way to handle collisions)
    if request:
        referer = request.headers.get("Referer")
        if referer:
            from urllib.parse import urlparse, parse_qs
            try:
                parsed = urlparse(referer)
                qs = parse_qs(parsed.query)
                # The 'p' parameter contains the path to the current document
                p_val = qs.get('p', [None])[0]
                if p_val:
                    # Extract the first part which is the slug
                    ref_slug = p_val.split('/')[0]
                    # Try this slug first
                    alt_path = get_safe_path(base_dir, os.path.join(ref_slug, path))
                    if os.path.exists(alt_path):
                        return alt_path
            except Exception:
                pass

    # 2. Fallback to Map-based lookup (O(1))
    first_part = path.split('/')[0]
    path_map = get_flattened_path_map(base_dir)
    
    if first_part in path_map:
        slug = path_map[first_part]
        # Prepend slug and return the full safe path
        return get_safe_path(base_dir, os.path.join(slug, path))
    
    return None
