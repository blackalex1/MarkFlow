import os
import mimetypes

mimetypes.add_type("application/javascript", ".js")
mimetypes.add_type("text/css", ".css")
mimetypes.add_type("image/svg+xml", ".svg")
import asyncio
from fastapi import FastAPI, Request, HTTPException
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
from watchdog.observers import Observer
from watchdog.events import FileSystemEventHandler
from contextlib import asynccontextmanager
from slowapi.errors import RateLimitExceeded
from slowapi import _rate_limit_exceeded_handler

from core.database import init_db, update_fts_index, delete_fts_index, reindex_all_docs
from core.auth import router as auth_router, get_current_user
from core.git_sync import router as git_router
from core.routes.files import router as files_router
from core.routes.search import router as search_router
from core.routes.system import router as system_router
from core.config import APP_CONFIG, DOCS_DIR, BASE_DIR, limiter
from core.middleware import add_security_headers
from core.services.vendor_service import check_and_download_vendor_libs
from core.services.setup_service import initialize_volumes

class DocsHandler(FileSystemEventHandler):
    def on_modified(self, event):
        if not event.is_directory and event.src_path.endswith(".md"):
            self.update_index(event.src_path)

    def on_created(self, event):
        if not event.is_directory and event.src_path.endswith(".md"):
            self.update_index(event.src_path)

    def on_deleted(self, event):
        if not event.is_directory and event.src_path.endswith(".md"):
            rel_path = os.path.relpath(event.src_path, DOCS_DIR).replace('\\', '/')
            delete_fts_index(rel_path)

    def update_index(self, abs_path):
        rel_path = os.path.relpath(abs_path, DOCS_DIR).replace('\\', '/')
        try:
            with open(abs_path, "r", encoding="utf-8") as f:
                content = f.read()
                update_fts_index(rel_path, os.path.basename(abs_path).replace(".md", ""), content)
        except Exception as e:
            print(f"Error indexing {abs_path}: {e}")

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Initialize environment and volumes
    initialize_volumes()
    
    # Auto-cache vendor libraries if missing
    check_and_download_vendor_libs()
    
    init_db()
    asyncio.create_task(asyncio.to_thread(reindex_all_docs, DOCS_DIR))
    
    # Ensure DOCS_DIR exists for observer
    if not os.path.exists(DOCS_DIR):
        os.makedirs(DOCS_DIR)
        
    observer = Observer()
    observer.schedule(DocsHandler(), DOCS_DIR, recursive=True)
    observer.start()

    # Start Git Background Worker
    from core.services.git_service import start_background_sync_worker
    bg_task = asyncio.create_task(start_background_sync_worker())

    yield
    bg_task.cancel()
    observer.stop()
    observer.join()

app = FastAPI(title=APP_CONFIG.get("app_name", "MarkFlow"), lifespan=lifespan)
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

# Middlewares
app.middleware("http")(add_security_headers)

# Routers
app.include_router(auth_router, prefix="/api/auth", tags=["auth"])
app.include_router(git_router, prefix="/api/git", tags=["git"])
app.include_router(files_router, prefix="/api/files", tags=["files"])
app.include_router(search_router, prefix="/api/search", tags=["search"])
app.include_router(system_router, prefix="/api/system", tags=["system"])

# Static and Templates
app.mount("/static", StaticFiles(directory=os.path.join(BASE_DIR, "static")), name="static")

# Config assets with fallback
config_dir = os.path.join(os.path.dirname(BASE_DIR), "config")
if not os.path.exists(config_dir):
    config_dir = os.path.join(BASE_DIR, "config_example")
app.mount("/config", StaticFiles(directory=config_dir), name="config")

app.mount("/config_default", StaticFiles(directory=os.path.join(BASE_DIR, "config_example")), name="config_default")
templates = Jinja2Templates(directory=os.path.join(BASE_DIR, "templates"))

import time
APP_VERSION = str(int(time.time()))

templates.context_processors.append(lambda request: {"config": APP_CONFIG, "app_version": APP_VERSION})

@app.get("/")
def read_root(request: Request):
    user = get_current_user(request)
    return templates.TemplateResponse(request, "index.html", {
        "user_role": user.get("role", "guest") if user else "guest",
        "is_authenticated": user is not None
    })

@app.get("/{rest_of_path:path}")
async def catch_all(request: Request, rest_of_path: str):
    if rest_of_path.startswith(("api/", "static/")) or ("." in rest_of_path.split("/")[-1] and not rest_of_path.endswith(".md")):
        raise HTTPException(status_code=404)
    
    user = get_current_user(request)
    return templates.TemplateResponse(request, "index.html", {
        "user_role": user.get("role", "guest") if user else "guest",
        "is_authenticated": user is not None
    })

if __name__ == "__main__":
    import uvicorn
    proj_root = os.path.dirname(BASE_DIR)
    cert_path, key_path = os.path.join(proj_root, "cert.pem"), os.path.join(proj_root, "key.pem")
    ssl_config = {"ssl_keyfile": key_path, "ssl_certfile": cert_path} if os.path.exists(cert_path) and os.path.exists(key_path) else {}
    
    # Security: Only allow proxy headers from trusted sources.
    # We try to load from environment or config/.env file
    import os
    from dotenv import load_dotenv
    config_env_path = os.path.join(os.path.dirname(BASE_DIR), "config", ".env")
    if os.path.exists(config_env_path):
        load_dotenv(config_env_path)
    
    # Default to local and our new Docker subnet + standard Docker subnets
    default_trusted = "127.0.0.1,172.20.0.5,172.16.0.0/12,192.168.0.0/16,10.0.0.0/8"
    trusted_ips = os.getenv("TRUSTED_PROXIES", default_trusted)
    
    print(f"Starting server with trusted proxies: {trusted_ips}")
    uvicorn.run("core.main:app", host="0.0.0.0", port=8000, reload=True, proxy_headers=True, forwarded_allow_ips=trusted_ips, **ssl_config)
