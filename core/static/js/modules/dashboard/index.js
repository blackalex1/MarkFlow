import { ui, state } from '../ui.js';
import { logout } from '../auth.js';
import { initRepos, loadRepositories } from './repos/index.js';
import { initSync, loadSyncConfig } from './sync.js';
import { initSettings, loadGlobalSSHKey } from './settings.js';
import { initSystemSettings } from './system.js';
import { initAdmin } from '../admin.js';
import { initAuditTab } from './audit.js';
import { initStatuses, renderStatusesTable } from './statuses.js';
import { renderStats } from './stats.js';

import { update2FAStatusUI, updateCredsStatusUI } from './settings.js';
export { update2FAStatusUI, updateCredsStatusUI };

export function initDashboardListeners() {
    if (ui.btnCloseDashboard) {
        ui.btnCloseDashboard.addEventListener('click', () => ui.dashboardModal.classList.add('hidden'));
    }
    
    const logoutBtn = document.getElementById('btn-logout');
    if (logoutBtn) {
        logoutBtn.addEventListener('click', logout);
    }

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
        }
        if (tabName === 'stats') renderStats();

        // Ensure all new elements are translated
        if (window.i18n) window.i18n.updatePage();
    };

    // Tab Switching Logic
    const tabs = document.querySelectorAll('.dashboard-tabs .tab-item');
    tabs.forEach(tab => {
        tab.addEventListener('click', () => {
            const tabName = tab.getAttribute('data-tab');
            if (!tabName) return;
            
            // UI Update
            tabs.forEach(t => t.classList.remove('active'));
            tab.classList.add('active');
            
            document.querySelectorAll('.tab-content').forEach(c => c.classList.add('hidden'));
            const target = document.getElementById(`tab-${tabName}`);
            if (target) target.classList.remove('hidden');

            loadActiveTab();
        });
    });

    // Initialize sub-modules (LISTENERS ONLY, NO FETCHING)
    initRepos();
    initSync();
    initSettings();
    initSystemSettings();
    initAdmin(); 
    initStatuses();

    // Safe Centralized Global Click for Dashboard Pickers
    if (!document.body.dataset.dashboardGlobalListener) {
        document.addEventListener('click', (e) => {
            // Only process if dashboard is open
            const dashboard = document.getElementById('dashboard-modal');
            if (!dashboard || dashboard.classList.contains('hidden')) return;

            // Handle System Color Picker
            const sysDropdown = document.getElementById('sys-color-dropdown');
            const sysTrigger = document.getElementById('sys-color-trigger');
            if (sysDropdown && sysDropdown.classList.contains('active')) {
                if (!sysDropdown.contains(e.target) && !sysTrigger.contains(e.target)) {
                    sysDropdown.classList.remove('active');
                    sysDropdown.style.display = 'none';
                    const pickerContainer = document.getElementById('accent-color-picker');
                    if (pickerContainer) pickerContainer.style.zIndex = "100";
                }
            }

            // Handle Status Color Picker
            const statusDropdown = document.getElementById('status-color-dropdown');
            const statusTrigger = document.getElementById('status-color-trigger');
            if (statusDropdown && statusDropdown.classList.contains('active')) {
                if (!statusDropdown.contains(e.target) && !statusTrigger.contains(e.target)) {
                    statusDropdown.classList.remove('active');
                    statusDropdown.style.display = 'none';
                }
            }
        });
        document.body.dataset.dashboardGlobalListener = "true";
    }

    // Escape Key to close dashboard
    if (!document.body.dataset.dashboardEscListener) {
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                const dashboard = ui.dashboardModal;
                if (dashboard && !dashboard.classList.contains('hidden')) {
                    dashboard.classList.add('hidden');
                }
            }
        });
        document.body.dataset.dashboardEscListener = "true";
    }

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
