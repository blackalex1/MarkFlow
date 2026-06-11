import pytest
import os
import sqlite3
import tempfile

from fastapi.testclient import TestClient
from core.main import app
import core.db.base

@pytest.fixture(scope="session", autouse=True)
def test_db():
    # Create a temporary database for the whole test session
    fd, path = tempfile.mkstemp()
    core.db.base.DB_PATH = path
    
    # Initialize the database
    from core.database import init_db
    init_db()
    
    yield path
    
    # Cleanup
    os.close(fd)
    if os.path.exists(path):
        try:
            os.unlink(path)
        except Exception:
            pass

@pytest.fixture
def client():
    c = TestClient(app, base_url="http://localhost")
    c.headers.update({
        "Origin": "http://localhost",
        "X-CSRF-Token": "test_csrf_token"
    })
    c.cookies["csrf_token"] = "test_csrf_token"
    return c

@pytest.fixture
def admin_token(client):
    pass

def mock_user(role="owner", username="admin"):
    return {"username": username, "role": role}

@pytest.fixture
def mock_admin():
    from core.auth import (
        get_current_user, get_reporter_user, get_developer_user,
        get_maintainer_user, get_owner_user, get_admin_user
    )
    user = mock_user("owner")
    app.dependency_overrides[get_current_user] = lambda: user
    app.dependency_overrides[get_reporter_user] = lambda: user
    app.dependency_overrides[get_developer_user] = lambda: user
    app.dependency_overrides[get_maintainer_user] = lambda: user
    app.dependency_overrides[get_owner_user] = lambda: user
    app.dependency_overrides[get_admin_user] = lambda: user
    yield
    app.dependency_overrides.clear()

@pytest.fixture
def mock_guest():
    from core.auth import (
        get_current_user, get_reporter_user, get_developer_user,
        get_maintainer_user, get_owner_user, get_admin_user
    )
    from fastapi import HTTPException
    
    user = mock_user("guest", "guest_user")
    app.dependency_overrides[get_current_user] = lambda: user
    
    def deny():
        raise HTTPException(status_code=403, detail="Access denied")
    
    app.dependency_overrides[get_reporter_user] = deny
    app.dependency_overrides[get_developer_user] = deny
    app.dependency_overrides[get_maintainer_user] = deny
    app.dependency_overrides[get_owner_user] = deny
    app.dependency_overrides[get_admin_user] = deny
    yield
    app.dependency_overrides.clear()

@pytest.fixture
def mock_anonymous():
    from core.auth import (
        get_current_user, get_reporter_user, get_developer_user,
        get_maintainer_user, get_owner_user, get_admin_user
    )
    from fastapi import HTTPException
    
    app.dependency_overrides[get_current_user] = lambda: None
    
    def fail_auth():
        raise HTTPException(status_code=401, detail="Not authenticated")
        
    app.dependency_overrides[get_reporter_user] = fail_auth
    app.dependency_overrides[get_developer_user] = fail_auth
    app.dependency_overrides[get_maintainer_user] = fail_auth
    app.dependency_overrides[get_owner_user] = fail_auth
    app.dependency_overrides[get_admin_user] = fail_auth
    yield
    app.dependency_overrides.clear()
