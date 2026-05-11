import { ui } from '../../ui.js';
import { toast } from '../../toasts.js';
import { t } from '../../i18n.js';
import { escapeHTML } from '../../security.js';
import { loadSyncConfig } from '../sync.js';
import { editRepo } from './editor.js';

/**
 * Loads and renders the list of git repositories
 */
export async function loadRepositories() {
    const container = document.getElementById('git-repos-table-container');
    if (!container) return;
    
    try {
        const res = await fetch('/api/git/repos');
        if (!res.ok) return;
        const repos = await res.json();
        if (!Array.isArray(repos)) return;
        
        const rows = repos.map(repo => {
            let syncInfo = `<span style="color: var(--text-muted); font-size: 11px;">${t('sync_never')}</span>`;
            if (repo.last_sync_at) {
                const date = new Date(repo.last_sync_at);
                const timeStr = date.toLocaleString();
                const isSuccess = repo.last_sync_status === 'success';
                const color = isSuccess ? '#22c55e' : '#ef4444';
                const icon = isSuccess ? 'check-circle' : 'x-circle';
                
                syncInfo = `
                    <div style="display: flex; flex-direction: column; gap: 2px;">
                        <div style="display: flex; align-items: center; gap: 4px; color: ${color}; font-size: 12px; font-weight: 600;">
                            <i data-lucide="${icon}" style="width: 14px; height: 14px;"></i>
                            <span>${isSuccess ? t('sync_success') : t('sync_failed')}</span>
                        </div>
                        <span style="color: var(--text-muted); font-size: 10px;">${timeStr}</span>
                    </div>
                `;
            }

            const safeRepoName = escapeHTML(repo.name);
            const safeRepoUrl = escapeHTML(repo.url);
            
            return `
                <tr>
                    <td>
                        <div style="display: flex; flex-direction: column;">
                            <span style="font-weight: 500; font-size: 14px; word-break: break-all;">${safeRepoName}</span>
                            <span style="font-size: 11px; color: var(--text-muted); opacity: 0.8; margin-top: 2px; word-break: break-all;">${safeRepoUrl}</span>
                        </div>
                    </td>
                    <td style="white-space: nowrap;">${syncInfo}</td>
                    <td style="text-align: right; white-space: nowrap;">
                        <div style="display: flex; gap: 8px; justify-content: flex-end; align-items: center;">
                            ${repo.is_active ? 
                                `<span class="tag tag-on" style="font-size: 11px; padding: 4px 10px;">${t('repo_btn_active')}</span>` : 
                                `<button class="btn btn-sm btn-outline btn-activate" style="padding: 4px 12px;" data-id="${repo.id}">${t('repo_btn_activate')}</button>`
                            }
                            <button class="btn btn-sm btn-text btn-edit" style="padding: 4px 8px;" data-id="${repo.id}">${t('repo_btn_edit')}</button>
                            <button class="btn btn-sm btn-text btn-danger btn-delete" style="padding: 4px 8px;" data-id="${repo.id}">${t('repo_btn_delete')}</button>
                        </div>
                    </td>
                </tr>
            `;
        }).join('');

        container.innerHTML = `
            <table class="admin-table">
                <thead>
                    <tr>
                        <th style="text-align: left;" data-t="repo_th_name">${t('repo_th_name')}</th>
                        <th style="text-align: left; white-space: nowrap;" data-t="repo_th_status">${t('repo_th_status')}</th>
                        <th style="text-align: right; white-space: nowrap;" data-t="repo_th_actions">${t('repo_th_actions')}</th>
                    </tr>
                </thead>
                <tbody id="git-repos-tbody">
                    ${rows}
                </tbody>
            </table>
        `;

        // Attach listeners
        const tbody = container.querySelector('#git-repos-tbody');
        tbody.querySelectorAll('.btn-activate').forEach(btn => {
            btn.onclick = () => activateRepo(btn.dataset.id);
        });
        tbody.querySelectorAll('.btn-edit').forEach(btn => {
            btn.onclick = () => editRepo(btn.dataset.id);
        });
        tbody.querySelectorAll('.btn-delete').forEach(btn => {
            btn.onclick = () => deleteRepo(btn.dataset.id);
        });

        if (window.lucide) window.lucide.createIcons();
    } catch (err) {
        console.error('Failed to load repositories:', err);
    }
}

/**
 * Activates a repository
 */
export async function activateRepo(id) {
    try {
        const res = await fetch(`/api/git/repos/${id}/activate`, { method: 'POST' });
        if (res.ok) {
            toast.success(t('toast_repo_activated'));
            loadRepositories();
            loadSyncConfig();
        }
    } catch (err) {
        toast.error(t('toast_repo_activate_error'));
    }
}

/**
 * Deletes a repository
 */
export async function deleteRepo(id) {
    const confirmed = await window.confirmAction(
        t('confirm_delete_repo_title', 'Delete Repository'),
        t('confirm_delete_repo', 'Are you sure you want to delete this repository configuration?'),
        t('btn_confirm_delete', 'Delete'),
        t('btn_cancel', 'Cancel')
    );
    if (!confirmed) return;
    
    try {
        const res = await fetch(`/api/git/repos/${id}`, { method: 'DELETE' });
        if (res.ok) {
            toast.success(t('toast_repo_deleted'));
            loadRepositories();
        }
    } catch (err) {
        toast.error(t('toast_repo_delete_error'));
    }
}
