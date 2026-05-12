import { API } from './api.js';
import { state, ui } from './ui.js';
import { toast } from './toasts.js';
import { escapeHTML } from './security.js';
import { t } from './i18n.js';

/**
 * Loads all available document statuses from the server
 */
export async function loadStatuses() {
    try {
        const res = await fetch(API.STATUSES);
        if (res.ok) {
            const data = await res.json();
            // Convert list to map for fast lookup: slug -> {name, color, id, is_system}
            state.statuses = data.reduce((acc, s) => {
                acc[s.slug] = s;
                return acc;
            }, {});
            return data;
        }
    } catch (e) {
        console.error("Failed to load statuses:", e);
    }
    return [];
}


/**
 * Returns color for a status slug, or default gray
 */
export function getStatusColor(slug) {
    const status = state.statuses[slug];
    return status ? status.color : '#94a3b8';
}

/**
 * Returns localized name or raw name for a status
 */
export function getStatusName(slug) {
    const status = state.statuses[slug];
    if (!status) return slug;
    
    // For system statuses, prefer translated name
    if (status.is_system) {
        const translated = t(`status_${status.slug}`);
        if (translated && translated !== `status_${status.slug}`) return translated;
    }
    
    return status.name;
}

/**
 * Populates a container with status items
 */
export function renderStatusDropdown(container, onSelect) {
    if (!container) return;
    container.innerHTML = '';
    
    Object.values(state.statuses).forEach(status => {
        const item = document.createElement('div');
        item.className = 'dropdown-item';
        item.dataset.value = status.slug;
        const displayName = status.is_system ? (t(`status_${status.slug}`) || status.name) : status.name;
        item.innerHTML = `<span class="status-dot" style="background-color: ${status.color}; margin-right: 8px; width: 8px; height: 8px;"></span> ${escapeHTML(displayName)}`;
        
        item.addEventListener('click', (e) => {
            e.stopPropagation();
            onSelect(status.slug, displayName);
        });
        
        container.appendChild(item);
    });
}


/**
 * Updates the topbar status text
 */
export function updateStatusDisplay(slug) {
    const statusText = document.getElementById('current-status-text');
    if (statusText) {
        statusText.textContent = getStatusName(slug);
        statusText.removeAttribute('data-t'); 
    }
}

/**
 * Initializes the visibility toggle (Guest access)
 */
export function initVisibilityToggle() {
    if (!ui.visibilityCheckbox) return;

    ui.visibilityCheckbox.addEventListener('change', async () => {
        if (!state.currentFilePath) return;
        
        const isPublic = ui.visibilityCheckbox.checked;
        try {
            const res = await fetch(`${API.FILE_VISIBILITY}?path=${encodeURIComponent(state.currentFilePath)}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    public: isPublic
                })
            });

            if (res.ok) {
                toast.success(t('toast_visibility_updated'));
                // Refresh tree to show new icon (eye/lock)
                const tree = await import('./tree.js');
                tree.loadFileTree();
            } else {
                const err = await res.json();
                toast.error(err.detail || 'Error');
                // Revert UI on error
                ui.visibilityCheckbox.checked = !isPublic;
            }
        } catch (err) {
            console.error('Visibility toggle failed:', err);
            ui.visibilityCheckbox.checked = !isPublic;
        }
    });
}
