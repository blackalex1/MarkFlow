import { ui, state } from '../ui.js';
import { logout } from '../auth.js';
import { initRepos, loadRepositories } from './repos/index.js';
import { initSync, loadSyncConfig } from './sync.js';
import { initSettings, loadGlobalSSHKey } from './settings.js';
import { initSystemSettings } from './system.js';
import { initAdmin } from '../admin.js';
import { initAuditTab } from './audit.js';
import { initStatuses, renderStatusesTable } from './statuses.js';

import { update2FAStatusUI, updateCredsStatusUI } from './settings.js';
export { update2FAStatusUI, updateCredsStatusUI };

export function initDashboardListeners() {
    if (ui.btnCloseDashboard) ui.btnCloseDashboard.onclick = () => ui.dashboardModal.classList.add('hidden');
    
    const logoutBtn = document.getElementById('btn-logout');
    if (logoutBtn) logoutBtn.onclick = logout;

    const loadActiveTab = () => {
        const activeTab = document.querySelector('.dashboard-tabs .tab-item.active');
        if (!activeTab) return;
        const tabName = activeTab.getAttribute('data-tab');
        
        if (tabName === 'logs') initAuditTab();
        if (tabName === 'users') {
            import('../admin.js').then(m => m.loadUsers());
        }
        if (tabName === 'statuses') renderStatusesTable();
        if (tabName === 'git') {
            loadRepositories();
            loadSyncConfig();
            loadGlobalSSHKey();
        }
    };

    // Tab Switching Logic
    const tabs = document.querySelectorAll('.dashboard-tabs .tab-item');
    tabs.forEach(tab => {
        tab.onclick = () => {
            const tabName = tab.getAttribute('data-tab');
            if (!tabName) return;
            
            // UI Update
            tabs.forEach(t => t.classList.remove('active'));
            tab.classList.add('active');
            
            document.querySelectorAll('.tab-content').forEach(c => c.classList.add('hidden'));
            const target = document.getElementById(`tab-${tabName}`);
            if (target) target.classList.remove('hidden');

            loadActiveTab();
        };
    });

    // Initialize sub-modules (LISTENERS ONLY, NO FETCHING)
    initRepos();
    initSync();
    initSettings();
    initSystemSettings();
    initAdmin(); 
    initStatuses();

    // Initial load check for active tab
    if (ui.dashboardModal && !ui.dashboardModal.classList.contains('hidden')) {
        loadActiveTab();
    }

    // Load repositories on dashboard open
    const observer = new MutationObserver((mutations) => {
        mutations.forEach((mutation) => {
            if (mutation.target.id === 'user-dashboard-modal' && !mutation.target.classList.contains('hidden')) {
                loadActiveTab();
            }
        });
    });
    if (ui.dashboardModal) observer.observe(ui.dashboardModal, { attributes: true, attributeFilter: ['class'] });
}

