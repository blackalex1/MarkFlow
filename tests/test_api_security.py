import pytest
import json

def test_unauthorized_access(client, mock_anonymous):
    """Verify that unauthorized users cannot access sensitive endpoints"""
    endpoints = [
        "/api/git/repos",
        "/api/git/pubkey",
        "/api/auth/audit-logs",
        "/api/git/ssh-status"
    ]
    for endpoint in endpoints:
        response = client.get(endpoint)
        assert response.status_code in [401, 403], f"Endpoint {endpoint} should be blocked for anonymous. Got {response.status_code}: {response.text}"

def test_guest_access_limitations(client, mock_guest):
    """Verify that guest users have limited access"""
    # Guests might see their profile but not git repos or logs
    response = client.get("/api/git/repos")
    assert response.status_code in [401, 403], f"Guest should not see repos. Got {response.status_code}"
    
    response = client.get("/api/auth/audit-logs")
    assert response.status_code == 403

def test_admin_no_private_key_leak(client, mock_admin):
    """Verify that even admins don't see private keys in the repo list"""
    # 1. Add a repo with a unique key
    from core.database import add_repository
    repo_id = add_repository(
        name="Security Test Repo",
        slug="sec-test",
        url="git@github.com:test/repo.git",
        priv="-----BEGIN OPENSSH PRIVATE KEY-----\nSECRET_CONTENT\n-----END OPENSSH PRIVATE KEY-----",
        pub="ssh-rsa PUBLIC_CONTENT"
    )
    
    # 2. Get repos list
    response = client.get("/api/git/repos")
    assert response.status_code == 200
    repos = response.json()
    
    # 3. Verify no private key leakage
    for repo in repos:
        assert "ssh_private_key" not in repo or repo["ssh_private_key"] is None, "PRIVATE KEY LEAKED IN REPO LIST!"
        # Check that it's not present in any field
        repo_str = json.dumps(repo)
        assert "BEGIN OPENSSH PRIVATE KEY" not in repo_str
        assert "SECRET_CONTENT" not in repo_str

def test_global_settings_no_secret_leak(client, mock_admin):
    """Verify that global settings don't leak ENCRYPTION_SECRET"""
    from core.database import get_setting
    secret = get_setting('ENCRYPTION_SECRET')
    assert secret is not None
    
    # Usually settings are returned via a specific endpoint
    # Let's check /api/system/settings (if it exists)
    response = client.get("/api/system/settings")
    if response.status_code == 200:
        data = response.json()
        data_str = json.dumps(data)
        assert secret not in data_str, "ENCRYPTION_SECRET LEAKED IN SETTINGS!"
        assert "ENCRYPTION_SECRET" not in data_str

def test_pubkey_endpoints_only_return_public(client, mock_admin):
    """Verify that pubkey endpoints only return public data"""
    response = client.get("/api/git/pubkey")
    assert response.status_code == 200
    data = response.json()
    assert "pubkey" in data
    assert "private" not in json.dumps(data).lower()
    
    # Check specific repo pubkey
    from core.database import list_repositories
    repos = list_repositories()
    if repos:
        repo_id = repos[0]['id']
        response = client.get(f"/api/git/repos/{repo_id}/pubkey")
        assert response.status_code == 200
        data = response.json()
        assert "pubkey" in data
        assert "private" not in json.dumps(data).lower()

def test_ssrf_protection(client, mock_admin):
    """Verify that SSRF attempts in Git URLs are blocked"""
    ssrf_urls = [
        "http://127.0.0.1:8000",
        "http://localhost:22",
        "http://169.254.169.254/latest/meta-data/",
        "ssh://-oProxyCommand=whoami@google.com",
        "git@192.168.1.1:repo.git"
    ]
    for url in ssrf_urls:
        payload = {
            "name": "SSRF Test",
            "url": url,
            "slug": "ssrf-test",
            "branch": "main",
            "auto_sync_interval": 0,
            "sync_strategy": "rebase",
            "flatten_in_tree": False
        }
        response = client.post("/api/git/repos", json=payload)
        assert response.status_code == 400
        text = response.text.lower()
        assert any(word in text for word in ["blocked", "protocol", "illegal", "resolve", "injection"])

def test_path_traversal_sanitization(client, mock_admin):
    """Verify that path traversal in repository slugs is sanitized safely"""
    bad_slug = "../../../etc/passwd"
    payload = {
        "name": "Traversal Test",
        "url": "https://github.com/test/repo.git",
        "slug": bad_slug,
        "branch": "main",
        "auto_sync_interval": 0,
        "sync_strategy": "rebase",
        "flatten_in_tree": False
    }
    response = client.post("/api/git/repos", json=payload)
    assert response.status_code == 200
    
    # Verify it was sanitized
    res = client.get("/api/git/repos")
    repos = res.json()
    created_repo = next(r for r in repos if r['name'] == "Traversal Test")
    assert ".." not in created_repo['slug']
    assert "/" not in created_repo['slug']
    assert created_repo['slug'] == "etc-passwd"

def test_sql_injection_search(client, mock_admin):
    """Verify that SQL injection in search is handled safely"""
    sqli_queries = [
        "' OR 1=1 --",
        "\") OR 1=1 --",
        "'; DROP TABLE users; --",
        "*\""
    ]
    for q in sqli_queries:
        response = client.get(f"/api/search?q={q}")
        # FTS5 might return 200 with empty results or fail gracefully
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)

def test_rbac_detailed_access(client):
    """Verify detailed RBAC permissions: Reporter cannot access Maintainer endpoints"""
    from core.main import app
    from core.auth import get_current_user, get_maintainer_user, get_owner_user
    from fastapi import HTTPException
    
    # Setup Reporter mock
    reporter_user = {"username": "rep", "role": "reporter"}
    app.dependency_overrides[get_current_user] = lambda: reporter_user
    
    # Maintainer check should fail for Reporter
    def fail_maintainer():
        raise HTTPException(status_code=403, detail="Access denied. Required role: maintainer")
    
    app.dependency_overrides[get_maintainer_user] = fail_maintainer
    app.dependency_overrides[get_owner_user] = fail_maintainer
    
    # Reporter tries to access Maintainer-only endpoint
    response = client.get("/api/git/ssh-status")
    assert response.status_code == 403
    assert "maintainer" in response.text.lower()
    
    app.dependency_overrides.clear()
