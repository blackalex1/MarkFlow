import { ui, state } from './modules/ui.js';

// --- CSRF Protection Layer ---
function getCookie(name) {
    const value = `; ${document.cookie}`;
    const parts = value.split(`; ${name}=`);
    if (parts.length === 2) return parts.pop().split(';').shift();
}

const originalFetch = window.fetch;
window.fetch = async (...args) => {
    let [resource, config] = args;
    if (!config) config = {};
    
    // Only intercept local API calls
    const url = typeof resource === 'string' ? resource : resource.url;
    const isLocal = !url.startsWith('http') || url.startsWith(window.location.origin);
    
    if (isLocal) {
        if (!config.headers) config.headers = {};
        const method = (config.method || 'GET').toUpperCase();
        if (['POST', 'PUT', 'DELETE', 'PATCH'].includes(method)) {
            // Get CSRF token from meta tag because cookie is now HttpOnly
            const tokenMeta = document.querySelector('meta[name="csrf-token"]');
            const token = tokenMeta ? tokenMeta.content : '';
            
            if (token) {
                // If config.headers is Headers object
                if (config.headers instanceof Headers) {
                    config.headers.set('X-CSRF-Token', token);
                } else {
                    config.headers['X-CSRF-Token'] = token;
                }
            }
        }
    }
    return originalFetch(resource, config);
};
// -----------------------------
import * as auth from './modules/auth.js';
import * as tree from './modules/tree.js';
import * as viewer from './modules/viewer.js';
import * as editor from './editor/index.js';
import { initTheme } from './modules/theme.js';
import { initSearch } from './modules/search.js';
import { initGlobalHandlers } from './modules/utils.js';
import * as i18n from './modules/i18n.js';
import { initDashboardListeners } from './modules/dashboard.js';
import './modules/confirm.js';
import './modules/prompt.js';
import { loadStatuses } from './modules/status.js';

// --- Trusted Types Policy ---
if (window.trustedTypes && window.trustedTypes.createPolicy) {
    // We only create the 'default' policy if it doesn't exist.
    // DOMPurify 3.0+ will automatically create its own 'dompurify' policy.
    if (!window.trustedTypes.defaultPolicy) {
        try {
            window.trustedTypes.createPolicy('default', {
                createHTML: (string) => DOMPurify.sanitize(string, { 
                    RETURN_TRUSTED_TYPE: true,
                    ADD_TAGS: ['use', 'foreignObject', 'table', 'thead', 'tbody', 'tr', 'td', 'th'], // Required for Mermaid and dynamic tables
                    ADD_ATTR: ['xlink:href', 'transform', 'viewBox'],
                    USE_PROFILES: { html: true, svg: true, svgFilters: true }
                }),
                createScriptURL: (string) => string,
                createScript: (string) => string 
            });
        } catch (e) {
            console.warn('Trusted Types default policy could not be created:', e);
        }
    }
}
// -----------------------------

// Initialization
async function init() {
    const versionMeta = document.querySelector('meta[name="app-version"]');
    if (versionMeta) window.APP_VERSION = versionMeta.content;
    // Fix for highlight.js deprecation warnings (EasyMDE uses old API)
    if (window.hljs && typeof window.hljs.highlight === 'function') {
        const _origHljs = window.hljs.highlight;
        window.hljs.highlight = function(lang, code, ignoreIllegals, continuation) {
            if (typeof lang === 'string' && typeof code === 'string') {
                return _origHljs.call(window.hljs, code, { language: lang, ignoreIllegals: ignoreIllegals });
            }
            return _origHljs.apply(window.hljs, arguments);
        };
    }

    i18n.updatePage();
    updateLangLabel();
    initTheme();
    initSearch();
    initGlobalHandlers();
    await auth.checkAuth();
    initDashboardListeners();
    await loadStatuses();
    await editor.init();
    await tree.loadFileTree();
    
    // Check URL on load
    const params = new URLSearchParams(window.location.search);
    let path = params.get('p');
    if (!path && window.location.pathname !== '/' && window.location.pathname.endsWith('.md')) {
        path = decodeURIComponent(window.location.pathname.substring(1));
    }
    
    if (path) {
        const hash = window.location.hash.substring(1);
        viewer.loadFileContent(path, false, hash);
    }
}

function updateLangLabel() {
    if (ui.langLabel) {
        ui.langLabel.textContent = i18n.getLang().toUpperCase();
    }
}

// --- Event Listeners ---
window.addEventListener('load-file', (e) => viewer.loadFileContent(e.detail.path));
window.addEventListener('tree-update-required', () => tree.loadFileTree());
window.addEventListener('auth-changed', () => {
    auth.checkAuth();
    tree.loadFileTree();
});

// Actions
if (ui.btnDelete) ui.btnDelete.onclick = viewer.deleteCurrentFile;

if (ui.btnLangToggle) {
    ui.btnLangToggle.onclick = () => {
        const nextLang = i18n.getLang() === 'ru' ? 'en' : 'ru';
        i18n.setLang(nextLang);
        updateLangLabel();
        if (window.lucide) lucide.createIcons();
    };
}

// Auth Actions
if (ui.loginForm) ui.loginForm.onsubmit = auth.login;
if (ui.closeLogin) ui.closeLogin.onclick = () => ui.loginModal.classList.add('hidden');
if (ui.closeTotpSetup) ui.closeTotpSetup.onclick = () => ui.totpSetupModal.classList.add('hidden');
if (ui.btnVerify2fa) ui.btnVerify2fa.onclick = auth.verify2FA;

// Mobile Navigation
if (ui.mobileToggle) {
    ui.mobileToggle.onclick = () => {
        state.isSidebarActive = !state.isSidebarActive;
        ui.sidebar.classList.toggle('active', state.isSidebarActive);
        
        // Change icon based on state
        const icon = ui.mobileToggle.querySelector('i');
        if (icon) {
            icon.setAttribute('data-lucide', state.isSidebarActive ? 'x' : 'menu');
            if (window.lucide) lucide.createIcons();
        }
    };
}

// Close sidebar on file load (mobile)
window.addEventListener('load-file', () => {
    if (state.isSidebarActive) {
        state.isSidebarActive = false;
        ui.sidebar.classList.remove('active');
        const icon = ui.mobileToggle.querySelector('i');
        if (icon) {
            icon.setAttribute('data-lucide', 'menu');
            if (window.lucide) lucide.createIcons();
        }
    }
});

// Start
init();
