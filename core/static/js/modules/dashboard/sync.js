import { ui, state } from '../ui.js';
import { toast } from '../toasts.js';
import * as i18n from '../i18n.js';
import { loadRepositories } from './repos.js';
import { API } from '../api.js';

export function setSyncStatus(success, message = '') {
    if (!ui.syncStatusIcon) return;
    
    if (success === null) {
        ui.syncStatusIcon.innerHTML = '';
        if (ui.syncStatusText) ui.syncStatusText.innerText = '';
        return;
    }

    if (success) {
        ui.syncStatusIcon.innerHTML = '<i data-lucide="check-circle" style="color: #22c55e; width: 18px; height: 18px;"></i>';
        if (ui.syncStatusText) {
            ui.syncStatusText.innerText = i18n.t('sync_success') || 'Success';
            ui.syncStatusText.style.color = '#22c55e';
        }
    } else {
        ui.syncStatusIcon.innerHTML = '<i data-lucide="x-circle" style="color: #ef4444; width: 18px; height: 18px;"></i>';
        if (ui.syncStatusText) {
            ui.syncStatusText.innerText = message === 'Failed' ? (i18n.t('sync_failed') || 'Failed') : (message || i18n.t('sync_failed') || 'Error');
            ui.syncStatusText.style.color = '#ef4444';
        }
    }
    
    if (window.lucide) {
        window.lucide.createIcons();
    }
}

export async function loadSyncConfig() {
    try {
        const res = await fetch(API.GIT_CONFIG);
        const data = await res.json();
        if (res.ok && data.url) {
            if (ui.activeRepoUrlDisplay) ui.activeRepoUrlDisplay.innerText = data.url;
            if (ui.activeRepoBranchDisplay) {
                ui.activeRepoBranchDisplay.innerText = data.branch;
                ui.activeRepoBranchDisplay.className = 'tag tag-on';
            }
            if (data.last_sync_status) {
                setSyncStatus(data.last_sync_status === 'success', data.last_sync_status === 'success' ? '' : 'Failed');
            } else {
                setSyncStatus(null);
            }
        } else {
            if (ui.activeRepoUrlDisplay) ui.activeRepoUrlDisplay.innerText = i18n.t('git_select_repo') || 'Select a repo above';
            if (ui.activeRepoBranchDisplay) {
                ui.activeRepoBranchDisplay.innerText = '-';
                ui.activeRepoBranchDisplay.className = 'tag tag-off';
            }
            setSyncStatus(null);
        }
    } catch (e) {
        console.error('Failed to load sync config:', e);
    }
}

export function initSync() {
    if (state.currentUser && ['maintainer', 'owner'].includes(state.currentUser.role)) {
        loadSyncConfig();
    }

    if (ui.btnGitSync) {
        ui.btnGitSync.onclick = async () => {
            ui.btnGitSync.disabled = true;
            const originalText = ui.btnGitSync.innerText;
            ui.btnGitSync.innerText = i18n.t('btn_syncing') || 'Syncing...';
            
            if (ui.syncStatusIcon) ui.syncStatusIcon.innerHTML = '<div class="spinner-small"></div>';
            if (ui.syncStatusText) {
                ui.syncStatusText.innerText = i18n.t('btn_syncing') || 'Syncing...';
                ui.syncStatusText.style.color = '#f59e0b';
            }

            try {
                const res = await fetch('/api/git/sync', { method: 'POST' });
                const data = await res.json();
                if (res.ok) {
                    toast.success(i18n.t('toast_sync_success') || 'Synchronization successful!');
                    setSyncStatus(true);
                    loadRepositories();
                } else {
                    toast.error('Ошибка: ' + (data.detail || 'Error'));
                    setSyncStatus(false, 'Failed');
                }
            } catch (e) {
                setSyncStatus(false, 'Error');
            } finally {
                ui.btnGitSync.disabled = false;
                ui.btnGitSync.innerText = originalText;
            }
        };
    }

    if (ui.btnGitForceSync) {
        ui.btnGitForceSync.onclick = async () => {
            const confirmed = await window.confirmAction(
                i18n.t('confirm_force_sync_title') || 'Force Sync',
                i18n.t('confirm_force_sync') || 'WARNING: This will replace all local changes with the remote state.',
                i18n.t('btn_force_sync') || 'Force Sync',
                i18n.t('btn_cancel') || 'Cancel'
            );
            if (!confirmed) return;

            ui.btnGitForceSync.disabled = true;
            const originalText = ui.btnGitForceSync.innerText;
            ui.btnGitForceSync.innerText = '...';
            
            if (ui.syncStatusIcon) ui.syncStatusIcon.innerHTML = '<div class="spinner-small"></div>';
            if (ui.syncStatusText) {
                ui.syncStatusText.innerText = i18n.t('btn_syncing') || 'Syncing...';
                ui.syncStatusText.style.color = '#f59e0b';
            }

            try {
                const res = await fetch(`${API.GIT_SYNC}?force=true`, { method: 'POST' });
                const data = await res.json();
                if (res.ok) {
                    toast.success(i18n.t('toast_sync_success') || 'Synchronization successful!');
                    setSyncStatus(true);
                    loadRepositories();
                    window.dispatchEvent(new CustomEvent('tree-update-required'));
                } else {
                    toast.error('Error: ' + (data.detail || 'Error'));
                    setSyncStatus(false, 'Failed');
                }
            } catch (e) {
                setSyncStatus(false, 'Error');
            } finally {
                ui.btnGitForceSync.disabled = false;
                ui.btnGitForceSync.innerText = originalText;
            }
        };
    }
}
