# Security and Rate Limiting Configuration

SECURITY_LIMITS = {
    "login": "5/minute",
    "2fa_verify": "5/minute",
    "change_password": "3/minute",
    "create_user": "10/minute",
    "file_ops": "60/minute",
    "search": "30/minute"
}
