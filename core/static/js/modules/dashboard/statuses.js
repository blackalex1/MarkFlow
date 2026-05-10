import { API } from '../api.js';
import { toast } from '../toasts.js';
import { t } from '../i18n.js';
import { loadStatuses } from '../status.js';
import { escapeHTML } from '../security.js';
import { initSpectrumPicker } from '../color-picker-logic.js';

export function initStatuses() {
    const btnCreate = document.getElementById('btn-admin-create-status');
    if (btnCreate) {
        btnCreate.onclick = createStatus;
    }

    // Custom Color Picker logic
    const colorTrigger = document.getElementById('status-color-trigger');
    const colorDropdown = document.getElementById('status-color-dropdown');
    const colorPreviewCircle = document.getElementById('status-color-preview-circle');
    const colorValueDisplay = document.getElementById('status-color-value');
    const colorInput = document.getElementById('status-new-color');
    const swatches = colorDropdown ? colorDropdown.querySelectorAll('.color-swatch') : [];

    const updateColorPreview = (color) => {
        if (!/^#(?:[0-9a-fA-F]{3}){1,2}$/.test(color)) return;
        if (colorValueDisplay) colorValueDisplay.innerText = color;
        if (colorPreviewCircle) colorPreviewCircle.style.backgroundColor = color;
        if (colorInput) colorInput.value = color;
        
        swatches.forEach(s => {
            s.classList.toggle('active', s.dataset.color && s.dataset.color.toLowerCase() === color.toLowerCase());
        });
    };

    if (colorTrigger) {
        colorTrigger.onclick = (e) => {
            e.stopPropagation();
            colorDropdown.classList.toggle('active');
        };
    }

    document.addEventListener('click', (e) => {
        if (colorDropdown && !colorDropdown.contains(e.target) && !colorTrigger.contains(e.target)) {
            colorDropdown.classList.remove('active');
        }
    });

    swatches.forEach(swatch => {
        swatch.onclick = () => {
            const color = swatch.dataset.color;
            if (color) {
                updateColorPreview(color);
                colorDropdown.classList.remove('active');
            }
        };
    });

    // Custom Spectrum Picker logic
    initSpectrumPicker({
        canvasId: 'status-spectrum-canvas',
        cursorId: 'status-spectrum-cursor',
        hueSliderId: 'status-hue-slider',
        triggerId: 'status-spectrum-trigger',
        containerId: 'status-spectrum-container',
        valueInputId: 'status-new-color',
        onUpdate: (color) => {
            updateColorPreview(color);
        }
    });

    if (colorInput) {
        colorInput.oninput = (e) => {
            let color = e.target.value;
            if (color && !color.startsWith('#')) color = '#' + color;
            updateColorPreview(color);
        };
    }

    if (window.lucide) window.lucide.createIcons();
}


export async function renderStatusesTable() {
    const container = document.getElementById('statuses-table-container');
    if (!container) return;

    try {
        const statuses = await loadStatuses();
        if (!statuses || statuses.length === 0) {
            container.innerHTML = `<div style="padding: 30px; text-align: center; color: var(--text-muted);">${t('statuses_empty', 'No statuses defined.')}</div>`;
            return;
        }

        let html = `
            <table class="admin-table">
                <thead>
                    <tr>
                        <th style="text-align: center; width: 60px;">${t('status_col_preview', 'Preview')}</th>
                        <th>${t('status_col_name', 'Name')}</th>
                        <th style="width: 120px;">${t('status_col_color', 'Color')}</th>
                        <th style="text-align: right; width: 100px;">${t('status_col_actions', 'Actions')}</th>
                    </tr>
                </thead>
                <tbody>
        `;

        statuses.forEach(s => {
            const isSystem = s.is_system;
            const displayName = isSystem ? (t(`status_${s.slug}`) || s.name) : s.name;
            const lockIcon = `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="opacity: 0.5;"><rect width="18" height="11" x="3" y="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>`;

            html += `
                <tr data-id="${s.id}" class="${isSystem ? 'system-status' : ''}">
                    <td style="text-align: center;">
                        <span class="status-dot" style="background-color: ${escapeHTML(s.color)}; width: 8px; height: 8px; margin: 0; box-shadow: 0 0 10px ${escapeHTML(s.color)}, 0 0 4px ${escapeHTML(s.color)}; display: inline-block; border: 1px solid rgba(255,255,255,0.1);"></span>
                    </td>
                    <td>
                        <div style="display: flex; align-items: center; gap: 8px;">
                            <input type="text" class="status-name-input" value="${escapeHTML(displayName)}" 
                                   ${isSystem ? 'disabled' : ''} 
                                   style="width: 100%; height: 32px; font-size: 13px; ${isSystem ? 'opacity: 0.7; cursor: not-allowed; border: none; background: transparent;' : ''}">
                            ${isSystem ? lockIcon : ''}
                        </div>
                    </td>
                    <td>
                        <div style="display: flex; align-items: center; gap: 8px;">
                            <input type="color" class="status-color-input" value="${escapeHTML(s.color)}" 
                                   style="width: 24px; height: 24px; padding: 0; border: none; background: none; cursor: pointer; border-radius: 4px; flex-shrink: 0;">
                            <span style="font-family: monospace; font-size: 11px; opacity: 0.8;">${escapeHTML(s.color)}</span>
                        </div>
                    </td>
                    <td style="text-align: right;">
                        <div style="display: flex; gap: 8px; justify-content: flex-end;">
                            <button type="button" class="btn btn-sm btn-outline btn-save-status" style="display: flex; align-items: center; gap: 6px; padding: 4px 10px;">
                                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" data-lucide="save" class="lucide lucide-save"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"></path><polyline points="17 21 17 13 7 13 7 21"></polyline><polyline points="7 3 7 8 15 8"></polyline></svg>
                                <span>${t('btn_save', 'Save')}</span>
                            </button>
                            ${!isSystem ? `
                                <button type="button" class="btn btn-sm btn-outline btn-delete-status" style="display: flex; align-items: center; gap: 6px; padding: 4px 10px; color: #ef4444; border-color: rgba(239, 68, 68, 0.3);">
                                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" data-lucide="trash-2" class="lucide lucide-trash-2"><path d="M3 6h18"></path><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"></path><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"></path><line x1="10" x2="10" y1="11" y2="17"></line><line x1="14" x2="14" y1="11" y2="17"></line></svg>
                                    <span>${t('btn_delete', 'Delete')}</span>
                                </button>
                            ` : `<div style="width: 80px;"></div>`}
                        </div>
                    </td>
                </tr>
            `;
        });






        html += `</tbody></table>`;
        container.innerHTML = html;

        // Bind events
        container.querySelectorAll('.btn-save-status').forEach(btn => {
            btn.onclick = () => updateStatus(btn.closest('tr'));
        });
        container.querySelectorAll('.btn-delete-status').forEach(btn => {
            btn.onclick = () => deleteStatus(btn.closest('tr').dataset.id);
        });

        if (window.lucide) window.lucide.createIcons();

    } catch (err) {
        console.error('Failed to render statuses:', err);
    }
}

async function createStatus() {
    const nameInput = document.getElementById('status-new-name');
    const colorInput = document.getElementById('status-new-color');
    
    if (!nameInput || !colorInput) return;
    
    const name = nameInput.value.trim();
    const color = colorInput.value.trim();
    
    if (!name) {
        toast.error('Status name is required');
        return;
    }

    try {
        const res = await fetch(API.STATUSES, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name, color })
        });
        
        if (!res.ok) throw new Error('Failed to create status');
        
        nameInput.value = '';
        toast.success(t('status_created', 'Status created'));
        renderStatusesTable();
        
    } catch (err) {
        toast.error(err.message);
    }
}

async function updateStatus(row) {
    const id = row.dataset.id;
    const name = row.querySelector('.status-name-input').value.trim();
    const color = row.querySelector('.status-color-input').value;
    
    if (!name) return;

    try {
        const res = await fetch(`${API.STATUSES}/${id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name, color })
        });
        
        if (!res.ok) throw new Error('Update failed');
        toast.success(t('status_updated', 'Status updated'));
        renderStatusesTable();
    } catch (err) {
        toast.error(err.message);
    }
}

async function deleteStatus(id) {
    const confirmed = await window.confirmAction(
        t('confirm_delete_status_title', 'Delete Status'),
        t('confirm_delete_status_msg', 'Are you sure you want to delete this status?'),
        t('btn_delete', 'Delete'),
        t('btn_cancel', 'Cancel')
    );
    if (!confirmed) return;

    try {
        const res = await fetch(`${API.STATUSES}/${id}`, { method: 'DELETE' });
        if (!res.ok) throw new Error('Delete failed');
        toast.success(t('status_deleted', 'Status deleted'));
        renderStatusesTable();
    } catch (err) {
        toast.error(err.message);
    }
}

