import { API } from '../api.js';
import { toast } from '../toasts.js';
import { t } from '../i18n.js';
import { state } from '../ui.js';
import { loadStatuses } from '../status.js';
import { escapeHTML } from '../security.js';

export function initStatuses() {
    const btnCreate = document.getElementById('btn-admin-create-status');
    if (btnCreate) {
        btnCreate.onclick = createStatus;
    }
}

export async function renderStatusesTable() {
    const container = document.getElementById('statuses-table-container');
    if (!container) return;

    // Refresh global statuses cache first
    await loadStatuses();

    const statuses = Object.values(state.statuses);
    
    container.innerHTML = `
        <table class="admin-table">
                <thead>
                    <tr>
                        <th data-t="status_name_header">Name</th>
                        <th data-t="status_color_header">Color</th>
                        <th style="text-align: right;" data-t="status_actions_header">Actions</th>
                    </tr>
                </thead>
                <tbody>
                    ${statuses.map(s => `
                    <tr data-id="${s.id}" data-slug="${s.slug}">
                        <td>
                            <div style="display: flex; align-items: center; gap: 10px;">
                                <span class="status-dot" style="background-color: ${escapeHTML(s.color)}; width: 10px; height: 10px;"></span>
                                <input type="text" class="status-name-input" value="${escapeHTML(s.name)}" 
                                       ${s.is_system ? 'disabled' : ''} 
                                       style="background: transparent; border: none; color: #fff; width: 100%; outline: none;">
                            </div>
                        </td>
                        <td>
                            <div style="display: flex; align-items: center; gap: 8px;">
                                <input type="color" class="status-color-input" value="${escapeHTML(s.color)}" 
                                       style="width: 24px; height: 24px; padding: 0; border: none; background: none; cursor: pointer; border-radius: 4px;">
                                <span style="font-family: monospace; font-size: 11px; opacity: 0.7;">${escapeHTML(s.color)}</span>
                            </div>
                        </td>
                        <td style="text-align: right;">
                            <div style="display: flex; justify-content: flex-end; gap: 8px;">
                                <button class="btn-save-status btn-icon-only" title="Save" style="background: rgba(255,255,255,0.05); border: none; color: var(--text-muted); cursor: pointer; padding: 5px; border-radius: 4px;">
                                    <i data-lucide="save" style="width: 14px; height: 14px;"></i>
                                </button>
                                ${s.is_system ? '' : `
                                <button class="btn-delete-status btn-icon-only" title="Delete" style="background: rgba(239, 68, 68, 0.1); border: none; color: #ef4444; cursor: pointer; padding: 5px; border-radius: 4px;">
                                    <i data-lucide="trash-2" style="width: 14px; height: 14px;"></i>
                                </button>
                                `}
                            </div>
                        </td>
                    </tr>
                    `).join('')}
                </tbody>
        </table>
    `;

    if (window.lucide) lucide.createIcons();

    // Bind row actions
    container.querySelectorAll('tr[data-id]').forEach(row => {
        const id = row.dataset.id;
        const colorInput = row.querySelector('.status-color-input');
        const nameInput = row.querySelector('.status-name-input');
        const btnSave = row.querySelector('.btn-save-status');
        const btnDelete = row.querySelector('.btn-delete-status');

        if (colorInput) {
            colorInput.onchange = (e) => {
                row.querySelector('.status-dot').style.backgroundColor = e.target.value;
                row.querySelector('span').textContent = e.target.value;
            };
        }

        if (btnSave) {
            btnSave.onclick = () => updateStatus(id, nameInput.value, colorInput.value);
        }

        if (btnDelete) {
            btnDelete.onclick = () => deleteStatus(id);
        }
    });
}

async function createStatus() {
    const nameInput = document.getElementById('status-new-name');
    const colorInput = document.getElementById('status-new-color');
    
    if (!nameInput.value) {
        toast(t('sys_name_empty'), 'error');
        return;
    }

    try {
        const res = await fetch(API.STATUSES, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                name: nameInput.value,
                color: colorInput.value
            })
        });

        if (res.ok) {
            toast(t('status_created'), 'success');
            nameInput.value = '';
            renderStatusesTable();
        } else {
            const data = await res.json();
            toast(data.detail || 'Error', 'error');
        }
    } catch (e) {
        toast('Network error', 'error');
    }
}

async function updateStatus(id, name, color) {
    try {
        const res = await fetch(`${API.STATUSES}/${id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name, color })
        });

        if (res.ok) {
            toast(t('status_updated'), 'success');
            renderStatusesTable();
        } else {
            toast('Failed to update', 'error');
        }
    } catch (e) {
        toast('Network error', 'error');
    }
}

async function deleteStatus(id) {
    const confirmed = await window.confirmAction(
        t('confirm_delete_title'),
        t('confirm_delete_msg') + '?',
        t('btn_delete'),
        t('btn_cancel')
    );

    if (!confirmed) return;

    try {
        const res = await fetch(`${API.STATUSES}/${id}`, {
            method: 'DELETE'
        });

        if (res.ok) {
            toast(t('status_deleted'), 'success');
            renderStatusesTable();
        } else {
            toast('Failed to delete', 'error');
        }
    } catch (e) {
        toast('Network error', 'error');
    }
}
