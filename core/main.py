import os
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
from core.config import APP_CONFIG, DOCS_DIR, BASE_DIR, limiter
from core.middleware import add_security_headers
from core.services.vendor_service import check_and_download_vendor_libs

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
    yield
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

# Static and Templates
app.mount("/static", StaticFiles(directory=os.path.join(BASE_DIR, "static")), name="static")

# Branding with fallback
branding_dir = os.path.join(BASE_DIR, "branding")
if not os.path.exists(branding_dir):
    branding_dir = os.path.join(BASE_DIR, "branding_example")
app.mount("/branding", StaticFiles(directory=branding_dir), name="branding")

app.mount("/branding_default", StaticFiles(directory=os.path.join(BASE_DIR, "branding_example")), name="branding_default")
templates = Jinja2Templates(directory=os.path.join(BASE_DIR, "templates"))

templates.context_processors.append(lambda request: {"config": APP_CONFIG})

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
    uvicorn.run("core.main:app", host="0.0.0.0", port=8000, reload=True, **ssl_config)
