import { ui, state } from './modules/ui.js';
import * as auth from './modules/auth.js';
import * as tree from './modules/tree.js';
import * as viewer from './modules/viewer.js';
import * as editor from './modules/editor.js';
import { initTheme } from './modules/theme.js';
import { initSearch } from './modules/search.js';
import { initGlobalHandlers } from './modules/utils.js';
import * as i18n from './modules/i18n.js';

// Initialization
async function init() {
    i18n.updatePage();
    updateLangLabel();
    initTheme();
    initSearch();
    initGlobalHandlers();
    
    await auth.checkAuth();
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

// Editor Actions
if (ui.btnEdit) ui.btnEdit.onclick = () => editor.toggleEditMode(true);
if (ui.btnDelete) ui.btnDelete.onclick = viewer.deleteCurrentFile;
if (ui.btnCancel) ui.btnCancel.onclick = () => editor.toggleEditMode(false);
if (ui.btnSave) ui.btnSave.onclick = editor.saveFile;
if (ui.visibilityCheckbox) ui.visibilityCheckbox.onchange = editor.updateVisibility;
if (ui.statusSelect) ui.statusSelect.onchange = editor.updateStatus;

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
