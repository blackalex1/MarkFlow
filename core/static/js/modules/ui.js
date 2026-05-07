export const ui = {
    fileTree: document.getElementById('file-tree'),
    contentViewer: document.getElementById('content-viewer'),
    viewModeContainer: document.getElementById('view-mode-container'),
    contentEditor: document.getElementById('content-editor'),
    topBar: document.getElementById('top-bar'),
    visibilityCheckbox: document.getElementById('visibility-checkbox'),
    breadcrumb: document.getElementById('breadcrumb'),
    btnEdit: document.getElementById('btn-edit'),
    btnDelete: document.getElementById('btn-delete'),
    btnSave: document.getElementById('btn-save'),
    btnCancel: document.getElementById('btn-cancel'),
    btnLangToggle: document.getElementById('btn-lang-toggle'),
    langLabel: document.getElementById('lang-label'),
    searchInput: document.getElementById('search-input'),
    searchResults: document.getElementById('search-results'),
    
    // Dashboard (LK)
    dashboardModal: document.getElementById('user-dashboard-modal'),
    btnNewPage: document.getElementById('btn-new-page'), // Actually it's not a button now, it's just a section? No, it's not used.
    btnCreatePage: document.getElementById('btn-create-page'),
    newItemType: document.getElementById('new-item-type'),
    newPageName: document.getElementById('new-page-name'),
    btnGitSync: document.getElementById('btn-git-sync'),
    gitRemoteUrl: document.getElementById('git-remote-url'),
    gitToken: document.getElementById('git-token'),
    btnSaveGitConfig: document.getElementById('btn-save-git-config'),
    btnToggle2FA: document.getElementById('btn-toggle-2fa'),
    status2FA: document.getElementById('2fa-status-tag'),
    desc2FA: document.getElementById('2fa-description'),
    btnCloseDashboard: document.getElementById('close-dashboard'),
    dashboardUsername: document.getElementById('dashboard-username'),
    btnUserDashboard: document.getElementById('btn-user-dashboard'),
    btnLoginTrigger: document.getElementById('btn-login-trigger'),
    loginModal: document.getElementById('login-modal'),
    totpContainer: document.getElementById('totp-container'),
    totpSetupModal: document.getElementById('totp-setup-modal'),
    totpQrContainer: document.getElementById('totp-qr-container'),
    pageToc: document.getElementById('page-toc'),
    tocSidebar: document.getElementById('toc-sidebar'),
    loginForm: document.getElementById('login-form'),
    closeLogin: document.getElementById('close-login'),
    closeTotpSetup: document.getElementById('close-totp-setup'),
    btnVerify2fa: document.getElementById('btn-verify-2fa'),
    loginUsername: document.getElementById('login-username'),
    loginPassword: document.getElementById('login-password'),
    loginTotp: document.getElementById('login-totp'),
    setupTotpCode: document.getElementById('setup-totp-code'),
    oldPassword: document.getElementById('old-password'),
    newPassword: document.getElementById('new-password'),
    btnLogoutAll: document.getElementById('btn-logout-all'),
    btnChangePassword: document.getElementById('btn-change-password'),
    
    // Admin Tabs & Lists
    tabItems: document.querySelectorAll('.tab-item'),
    tabContents: document.querySelectorAll('.tab-content'),
    ownerOnlyItems: document.querySelectorAll('.owner-only'),
    usersListBody: document.getElementById('users-list-body'),
    logsListBody: document.getElementById('logs-list-body'),
    adminNewUsername: document.getElementById('admin-new-username'),
    adminNewPassword: document.getElementById('admin-new-password'),
    adminNewRole: document.getElementById('admin-new-role'),
    btnAdminCreateUser: document.getElementById('btn-admin-create-user'),
    
    // Quick Switcher
    qsModal: document.getElementById('quick-switcher-modal'),
    qsInput: document.getElementById('qs-input'),
    qsResults: document.getElementById('qs-results'),
    
    // Page Navigation
    pageNav: document.getElementById('page-navigation'),
    navPrev: document.getElementById('nav-prev'),
    navNext: document.getElementById('nav-next'),
    
    // Editor Enhancements
    slashMenu: document.getElementById('slash-menu'),
    selectionToolbar: document.getElementById('selection-toolbar')
};

export const state = {
    currentUser: null,
    currentFilePath: null,
    setupTotpSecret: null,
    openFolders: new Set()
};
