import { ui, state } from '../ui.js';
import { logout } from '../auth.js';
import { initPages } from './pages.js';
import { initRepos, loadRepositories } from './repos.js';
import { initSync } from './sync.js';
import { initSettings } from './settings.js';
import { initSystemSettings } from './system.js';
import { initAdmin } from '../admin.js';

import { update2FAStatusUI, updateCredsStatusUI } from './settings.js';
export { update2FAStatusUI, updateCredsStatusUI };

export function initDashboardListeners() {
    if (ui.btnCloseDashboard) ui.btnCloseDashboard.onclick = () => ui.dashboardModal.classList.add('hidden');
    
    const logoutBtn = document.getElementById('btn-logout');
    if (logoutBtn) logoutBtn.onclick = logout;

    // Initialize sub-modules
    initPages();
    initRepos();
    initSync();
    initSettings();
    initSystemSettings();
    initAdmin();

    // Load repos on dashboard open
    const observer = new MutationObserver((mutations) => {
        mutations.forEach((mutation) => {
            if (mutation.target.id === 'user-dashboard-modal' && !mutation.target.classList.contains('hidden')) {
                if (state.currentUser && ['maintainer', 'owner'].includes(state.currentUser.role)) {
                    loadRepositories();
                    initAdmin();
                    initSystemSettings();
                }
            }
        });
    });
    if (ui.dashboardModal) observer.observe(ui.dashboardModal, { attributes: true, attributeFilter: ['class'] });
    
    // Only load if already open (e.g. refresh on open dashboard)
    if (ui.dashboardModal && !ui.dashboardModal.classList.contains('hidden')) {
        if (state.currentUser && ['maintainer', 'owner'].includes(state.currentUser.role)) {
            loadRepositories();
        }
    }
}
