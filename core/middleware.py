from fastapi import Request
from fastapi.responses import JSONResponse
from urllib.parse import urlparse

async def add_security_headers(request: Request, call_next):
    # DoS Protection: Limit maximum request size (e.g., 10MB)
    MAX_SIZE = 10 * 1024 * 1024 # 10MB
    content_length = request.headers.get("content-length")
    if content_length and int(content_length) > MAX_SIZE:
        return JSONResponse(status_code=413, content={"detail": "Request Entity Too Large: Max 10MB allowed"})

    # CSRF Protection for state-changing methods
    if request.method in ["POST", "PUT", "DELETE", "PATCH"]:
        origin = request.headers.get("origin")
        referer = request.headers.get("referer")
        
        # Support for proxies: check X-Forwarded-Proto and X-Forwarded-Host
        request_host = request.headers.get("X-Forwarded-Host", request.headers.get("host", ""))
        
        # Enforce Origin check (ignoring ports)
        if origin:
            origin_netloc = urlparse(origin).netloc
            clean_host = request_host.split(":")[0]
            clean_origin = origin_netloc.split(":")[0]
            
            if clean_origin != clean_host:
                return JSONResponse(status_code=403, content={"detail": f"CSRF Attack Detected: Origin mismatch. Host: {request_host}, Origin: {origin}"})
        elif request.method != "GET":
             if referer and request_host.split(":")[0] not in referer:
                  return JSONResponse(status_code=403, content={"detail": "CSRF Attack Detected: Referer mismatch"})

    response = await call_next(request)
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["X-XSS-Protection"] = "1; mode=block"
    response.headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains"
    
    # Tightened CSP - Self-hosted libraries only
    # Note: 'unsafe-inline' is still needed for some libraries to apply styles dynamically
    csp = (
        "default-src 'self'; "
        "script-src 'self' 'unsafe-inline' https://accounts.google.com; "
        "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://cdn.jsdelivr.net; "
        "font-src 'self' data: https://fonts.gstatic.com https://cdn.jsdelivr.net; "
        "img-src 'self' data: blob: https:; "
        "connect-src 'self'; "
        "frame-src https://accounts.google.com; "
        "object-src 'none'; "
        "base-uri 'self';"
    )
    response.headers["Content-Security-Policy"] = csp
    response.headers["Permissions-Policy"] = "camera=(), microphone=(), geolocation=()"

    # Caching for static assets
    if request.url.path.startswith(("/static/", "/branding/")):
        # Cache for static assets, but allow revalidation
        response.headers["Cache-Control"] = "public, max-age=86400, must-revalidate"
    
    return response
