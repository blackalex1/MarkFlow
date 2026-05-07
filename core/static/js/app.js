import { ui, state } from './modules/ui.js';
import * as auth from './modules/auth.js';
import * as tree from './modules/tree.js';
import * as viewer from './modules/viewer.js';
import * as editor from './modules/editor.js';
import { initTheme } from './modules/theme.js';
import { initSearch } from './modules/search.js';
import { initGlobalHandlers } from './modules/utils.js';

// Initialization
async function init() {
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

// --- Event Listeners ---
window.addEventListener('load-file', (e) => viewer.loadFileContent(e.detail.path));
window.addEventListener('tree-update-required', () => tree.loadFileTree());
window.addEventListener('auth-changed', () => {
    auth.checkAuth();
    tree.loadFileTree();
});

// Editor Actions
ui.btnEdit.onclick = () => editor.toggleEditMode(true);
ui.btnDelete.onclick = viewer.deleteCurrentFile;
ui.btnCancel.onclick = () => editor.toggleEditMode(false);
ui.btnSave.onclick = editor.saveFile;
ui.visibilityCheckbox.onchange = editor.updateVisibility;

// Auth Actions
ui.loginForm.onsubmit = auth.login;
ui.closeLogin.onclick = () => ui.loginModal.classList.add('hidden');
ui.closeTotpSetup.onclick = () => ui.totpSetupModal.classList.add('hidden');
ui.btnVerify2fa.onclick = auth.verify2FA;

// Start
init();
