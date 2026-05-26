import { ui, state } from '../ui.js';
import { t } from '../i18n.js';
import { getStatusColor, getStatusName } from '../status.js';

function escapeHTML(str) {
    if (!str) return "";
    return str.replace(/[&<>"']/g, function(m) {
        return {
            '&': '&amp;',
            '<': '&lt;',
            '>': '&gt;',
            '"': '&quot;',
            "'": '&#039;'
        }[m];
    });
}

export function renderFolderGrid(data) {
    ui.contentViewer.innerHTML = `
        <div class="folder-view fade-in">
            <h1 class="folder-view-title">${escapeHTML(data.name)}</h1>
            <div class="folder-grid">
                ${data.items.map(item => {
                    const icon = item.type === 'folder' ? 'folder' : (item.public ? 'file-text' : 'lock');
                    const canSeeStatus = state.currentUser && ['reporter', 'developer', 'maintainer', 'owner'].includes(state.currentUser.role);
                    let statusDot = '';
                    if (canSeeStatus && item.type === 'file') {
                        const status = item.status || 'published';
                        const color = getStatusColor(status);
                        const title = getStatusName(status);
                        statusDot = `<span class="status-dot" style="background-color: ${color};" title="${title}"></span>`;
                    }
                    
                    const safePath = escapeHTML(item.path);
                    const safeName = escapeHTML(item.name.replace('.md', ''));
                    
                    return `
                        <div class="folder-card ${item.type}-card" data-path="${safePath}">
                            <div class="card-icon">
                                ${statusDot}
                                <i data-lucide="${icon}"></i>
                            </div>
                            <div class="card-info">
                                <span class="card-name">${safeName}</span>
                                <span class="card-meta">${item.type === 'folder' ? (t('type_folder') || 'Folder') : (t('type_file') || 'Document')}</span>
                            </div>
                        </div>
                    `;
                }).join('')}
            </div>
        </div>
    `;

    ui.contentViewer.querySelectorAll('.folder-card').forEach(card => {
        card.addEventListener('click', () => {
            const path = card.getAttribute('data-path');
            window.dispatchEvent(new CustomEvent('load-file', { detail: { path } }));
        });
    });

    if (window.lucide) lucide.createIcons();
}
