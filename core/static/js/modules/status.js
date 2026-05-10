import { API } from './api.js';
import { state, ui } from './ui.js';
import { toast } from './toasts.js';
import { escapeHTML } from './security.js';

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
        }
    } catch (e) {
        console.error("Failed to load statuses:", e);
    }
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
        item.innerHTML = `<span class="status-dot" style="background-color: ${status.color}; margin-right: 8px; width: 8px; height: 8px;"></span> ${escapeHTML(status.name)}`;
        
        item.onclick = (e) => {
            e.stopPropagation();
            onSelect(status.slug, status.name);
        };
        
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
        statusText.removeAttribute('data-t'); // Prevent i18n from overwriting custom name
    }
}
