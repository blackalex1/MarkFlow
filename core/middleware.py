from fastapi import Request
from fastapi.responses import JSONResponse
from urllib.parse import urlparse
import secrets

async def add_security_headers(request: Request, call_next):
    # Generate a unique nonce for this request
    nonce = secrets.token_urlsafe(16)
    request.state.csp_nonce = nonce

    from core.config import SETTINGS
    # DoS Protection: Limit maximum request size
    max_mb = SETTINGS.get("max_request_size_mb", 10)
    MAX_SIZE = max_mb * 1024 * 1024
    content_length = request.headers.get("content-length")
    if content_length and int(content_length) > MAX_SIZE:
        return JSONResponse(
            status_code=413, 
            content={"detail": f"Request Entity Too Large: Max {max_mb}MB allowed. You can increase this in System Settings."}
        )

    # CSRF Protection for state-changing methods
    if request.method in ["POST", "PUT", "DELETE", "PATCH"]:
        origin = request.headers.get("origin")
        referer = request.headers.get("referer")
        csrf_header = request.headers.get("X-CSRF-Token")
        csrf_cookie = request.cookies.get("csrf_token")
        
        # Support for proxies: check X-Forwarded-Host or use validated request.url
        request_host = request.url.hostname
        clean_host = request_host
        
        # 1. Strict Token Check (Double Submit Cookie Pattern)
        if not csrf_header or not csrf_cookie or csrf_header != csrf_cookie:
             return JSONResponse(status_code=403, content={"detail": "CSRF Protection: Invalid or missing CSRF token."})

        # 2. Enforce Origin/Referer check as a second layer
        if origin:
            origin_hostname = urlparse(origin).hostname
            if origin_hostname != clean_host:
                return JSONResponse(status_code=403, content={"detail": "CSRF Attack Detected: Origin mismatch."})
        elif referer:
            referer_hostname = urlparse(referer).hostname
            if referer_hostname != clean_host:
                return JSONResponse(status_code=403, content={"detail": "CSRF Attack Detected: Referer mismatch."})
        else:
            return JSONResponse(status_code=403, content={"detail": "CSRF Protection: Missing Origin/Referer headers."})

    response = await call_next(request)
    
    # Ensure CSRF token exists
    if not request.cookies.get("csrf_token"):
        response.set_cookie(key="csrf_token", value=secrets.token_urlsafe(32), httponly=True, samesite="lax")
    
    # Modern Security Headers
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains"
    response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
    response.headers["Cross-Origin-Opener-Policy"] = "same-origin"
    response.headers["Cross-Origin-Resource-Policy"] = "same-origin"
    
    # Tightened CSP with Nonce and Strict-Dynamic
    csp = (
        "default-src 'self'; "
        f"script-src 'self' blob: 'nonce-{nonce}' 'strict-dynamic' https: http:; " 
        "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://cdn.jsdelivr.net; "
        "font-src 'self' data: https://fonts.gstatic.com https://cdn.jsdelivr.net; "
        "img-src 'self' data: blob: https:; " 
        "connect-src 'self'; "
        "frame-src 'self' blob: data:; " 
        "frame-ancestors 'none'; "
        "object-src 'none'; "
        "base-uri 'self'; "
        "require-trusted-types-for 'script'; "
        "trusted-types dompurify default;"
    )

    response.headers["Content-Security-Policy"] = csp
    response.headers["Permissions-Policy"] = "camera=(), microphone=(), geolocation=()"

    # Caching for static assets
    if request.url.path.startswith(("/static/", "/branding/", "/config/")):
        response.headers["Cache-Control"] = "public, max-age=86400, must-revalidate"
    
    return response
