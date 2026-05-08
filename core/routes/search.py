from fastapi import APIRouter, Request
from core.config import limiter, SECURITY_LIMITS
from core.database import search_fts, is_public
from core.auth import get_current_user, ROLES

router = APIRouter()

@router.get("")
@limiter.limit(SECURITY_LIMITS["search"])
def search_docs(q: str, request: Request):
    if not q or len(q) < 2:
        return {"results": []}
        
    user = get_current_user(request)
    user_role = user.get("role", "guest") if user else "guest"
    can_see_private = ROLES.get(user_role, 0) >= ROLES.get("reporter", 0)
    
    # Use FTS5 ranked search
    db_results = search_fts(q)
    
    results = []
    for r in db_results:
        # Check permissions
        if not is_public(r["path"]) and not can_see_private:
            continue
        results.append(r)
                
    return {"results": results}
