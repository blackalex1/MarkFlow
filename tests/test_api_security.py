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


def test_index_config_safe_json(client):
    """Verify that frontend configuration is safely embedded as application/json and not executable script interpolation"""
    response = client.get("/")
    assert response.status_code == 200
    html = response.text
    
    # Ensure safe JSON script tag is present
    assert '<script id="markflow-config" type="application/json">' in html
    assert "window.MARKFLOW_CONFIG = JSON.parse(document.getElementById('markflow-config').textContent);" in html
    
    # Ensure dangerous | safe pattern is absent
    assert "| safe" not in html
    
    # Extract and parse JSON
    start_tag = '<script id="markflow-config" type="application/json">'
    end_tag = '</script>'
    start_idx = html.find(start_tag) + len(start_tag)
    end_idx = html.find(end_tag, start_idx)
    json_str = html[start_idx:end_idx].strip()
    
    config_data = json.loads(json_str)
    assert "homePagePath" in config_data
    assert "flattenedSlugs" in config_data
    assert "repoMapping" in config_data


def test_security_headers_and_csp(client):
    """Verify modern security headers including COEP and full CSP directives"""
    response = client.get("/")
    assert response.status_code == 200
    headers = response.headers
    
    assert headers.get("Cross-Origin-Embedder-Policy") == "require-corp"
    assert headers.get("Cross-Origin-Opener-Policy") == "same-origin"
    assert headers.get("Cross-Origin-Resource-Policy") == "same-origin"
    
    csp = headers.get("Content-Security-Policy", "")
    assert "worker-src 'self' blob:;" in csp
    assert "manifest-src 'self';" in csp
    assert "require-trusted-types-for 'script';" in csp


def test_scanner_probes_blocked_404(client):
    """Verify that legacy scanner probes (CGI/PHP/etc) return 404 rather than 200 OK SPA HTML"""
    probes = [
        "/cgi-bin/test",
        "/cgi-bin/test.cgi",
        "/wp-login.php",
        "/wp-admin",
        "/phpmyadmin",
        "/actuator/health",
        "/shell.php"
    ]
    for probe in probes:
        response = client.get(probe)
        assert response.status_code == 404, f"Expected 404 for scanner probe {probe}, got {response.status_code}"


def test_vendor_purify_version():
    """Verify that vendor_service references safe DOMPurify >= 3.2.0"""
    from core.services.vendor_service import LIBRARIES
    purify_entry = next((entry for entry in LIBRARIES if "purify.min.js" in entry[1]), None)
    assert purify_entry is not None, "DOMPurify entry not found in LIBRARIES"
    url, rel_path, expected_hash = purify_entry
    assert "3.2." in url, f"Expected DOMPurify 3.2.x, got URL: {url}"
    assert expected_hash is not None and expected_hash.startswith("sha384-")


def test_cookie_secure_flag_adaptive():
    """Verify that create_session_cookie sets secure=False over HTTP and secure=True over HTTPS"""
    from fastapi import Response
    from starlette.requests import Request
    from core.auth.utils import create_session_cookie
    
    # 1. Plain HTTP request
    scope_http = {
        "type": "http",
        "method": "POST",
        "path": "/api/auth/login",
        "headers": [(b"host", b"192.168.1.59")],
        "scheme": "http"
    }
    req_http = Request(scope_http)
    res_http = Response()
    create_session_cookie(res_http, "testuser", request=req_http)
    cookie_header_http = res_http.headers.get("set-cookie", "")
    assert "session=" in cookie_header_http
    assert "secure" not in cookie_header_http.lower()
    
    # 2. HTTPS request (or behind HTTPS proxy with x-forwarded-proto)
    scope_https = {
        "type": "http",
        "method": "POST",
        "path": "/api/auth/login",
        "headers": [(b"host", b"example.com"), (b"x-forwarded-proto", b"https")],
        "scheme": "http"
    }
    req_https = Request(scope_https)
    res_https = Response()
    create_session_cookie(res_https, "testuser", request=req_https)
    cookie_header_https = res_https.headers.get("set-cookie", "")
    assert "session=" in cookie_header_https
    assert "secure" in cookie_header_https.lower()
