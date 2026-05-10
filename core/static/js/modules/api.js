/**
 * API Routes and Gateway
 * Strings are lightly obfuscated using Base64 to prevent simple text search extraction.
 */

const d = (s) => atob(s); // Simple decoder

export const API = {
    // Auth
    AUTH_ME: d('L2FwaS9hdXRoL21l'),             // /api/auth/me
    LOGIN: d('L2FwaS9hdXRoL2xvZ2lu'),           // /api/auth/login
    LOGOUT: d('L2FwaS9hdXRoL2xvZ291dA=='),      // /api/auth/logout
    VERIFY_2FA_LOGIN: d('L2FwaS9hdXRoL3ZlcmlmeS0yZmE='), // /api/auth/verify-2fa
    SETUP_2FA: d('L2FwaS9hdXRoLzJmYS9zZXR1cA=='), // /api/auth/2fa/setup
    VERIFY_2FA_SETUP: d('L2FwaS9hdXRoLzJmYS92ZXJpZnk='), // /api/auth/2fa/verify

    // Files
    FILE_TREE: d('L2FwaS9maWxlcy90cmVl'),       // /api/files/tree
    FILE_CONTENT: d('L2FwaS9maWxlcy9jb250ZW50'), // /api/files/content
    FOLDER_CONTENT: d('L2FwaS9maWxlcy9mb2xkZXI='), // /api/files/folder
    FILE_DELETE: d('L2FwaS9maWxlcy9kZWxldGU='),   // /api/files/delete
    FILE_CREATE: d('L2FwaS9maWxlcy9jcmVhdGU='),   // /api/files/create
    FILE_MKDIR: d('L2FwaS9maWxlcy9ta2Rpcg=='),    // /api/files/mkdir
    FILE_MOVE: d('L2FwaS9maWxlcy9tb3Zl'),         // /api/files/move
    FILE_STATUS: d('L2FwaS9maWxlcy9zdGF0dXM='),   // /api/files/status
    FILE_VISIBILITY: d('L2FwaS9maWxlcy92aXNpYmlsaXR5'), // /api/files/visibility

    // Search
    SEARCH: d('L2FwaS9zZWFyY2g='),              // /api/search

    // Git
    GIT_CONFIG: d('L2FwaS9naXQvY29uZmln'),       // /api/git/config
    GIT_REPOS: d('L2FwaS9naXQvcmVwb3M='),         // /api/git/repos
    GIT_SYNC: d('L2FwaS9naXQvc3luYw=='),          // /api/git/sync
    SSH_STATUS: d('L2FwaS9naXQvc3NoLXN0YXR1cw=='), // /api/git/ssh-status
    GIT_PUBKEY: d('L2FwaS9naXQvcHVia2V5'),        // /api/git/pubkey
    GIT_GENERATE_KEY: d('L2FwaS9naXQvZ2VuZXJhdGUtS2V5'), // /api/git/generate-key
    GIT_SAVE_KEYS: d('L2FwaS9naXQvc2F2ZS1rZXlz'), // /api/git/save-keys
    GIT_SET_SSH_KEY: d('L2FwaS9naXQvc2V0LXNzaC1rZXk='), // /api/git/set-ssh-key
    GIT_GEN_KEY_PAIR: d('L2FwaS9naXQvZ2VuLWtleS1wYWly'), // /api/git/gen-key-pair
    GIT_REPO_BY_ID: (id) => `${d('L2FwaS9naXQvcmVwb3M=')}/${id}`, // /api/git/repos/${id}

    // System
    BRANDING: d('L2FwaS9zeXN0ZW0vYnJhbmRpbmc='), // /api/system/branding
    SETTINGS: d('L2FwaS9zeXN0ZW0vc2V0dGluZ3M='), // /api/system/settings
    SYSTEM_UPLOAD_ASSET: d('L2FwaS9zeXN0ZW0vdXBsb2FkLWFzc2V0'), // /api/system/upload-asset
    AUDIT_LOGS: d('L2FwaS9hdXRoL2F1ZGl0LWxvZ3M='), // /api/auth/audit-logs
    STATUSES: d('L2FwaS9zeXN0ZW0vc3RhdHVzZXM='), // /api/system/statuses
};
