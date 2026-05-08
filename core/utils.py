from fastapi import Request

def get_real_ip(request: Request) -> str:
    # Check if we are behind a proxy
    forwarded_for = request.headers.get("x-forwarded-for")
    if forwarded_for:
        # X-Forwarded-For: client, proxy1, proxy2...
        return forwarded_for.split(",")[0].strip()
    return request.client.host if request.client else "127.0.0.1"
