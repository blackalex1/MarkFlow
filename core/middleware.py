from fastapi import Request
from fastapi.responses import JSONResponse

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
        base_url = f"{request.url.scheme}://{request.url.netloc}"
        
        # Enforce Origin check
        if origin:
            if not origin.startswith(base_url):
                return JSONResponse(status_code=403, content={"detail": "CSRF Attack Detected: Origin mismatch"})
        elif request.method != "GET": # Strict check for non-GET requests without origin
             if referer and not referer.startswith(base_url):
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
        "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; "
        "font-src 'self' data: https://fonts.gstatic.com; "
        "img-src 'self' data: blob:; "
        "connect-src 'self'; "
        "frame-src https://accounts.google.com; "
        "object-src 'none'; "
        "base-uri 'self';"
    )
    response.headers["Content-Security-Policy"] = csp
    response.headers["Permissions-Policy"] = "camera=(), microphone=(), geolocation=()"

    # Caching for static assets
    if request.url.path.startswith(("/static/", "/branding/")):
        # Cache for 1 year (immutable for versioned assets)
        response.headers["Cache-Control"] = "public, max-age=31536000, immutable"
    
    return response
