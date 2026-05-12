from fastapi import APIRouter, Depends, Request
from core.auth import get_current_user
from core.db.fts import search_fts
from core.metadata import is_public

router = APIRouter()

@router.get("")
def api_search(request: Request, q: str, user=Depends(get_current_user)):
    results = search_fts(q)
    
    # Filter by visibility if not admin
    is_admin = user and user.get('role') in ['developer', 'maintainer', 'owner']
    
    if not is_admin:
        results = [r for r in results if is_public(r['path'])]
        
    return results
