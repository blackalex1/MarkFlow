import { state } from '../ui.js';
import { t } from '../i18n.js';
import { handleMenuCommand } from './actions.js';

export function showContextMenu(e, node) {
    const existing = document.querySelector('.context-menu');
    if (existing) existing.remove();
    const menu = document.createElement('div');
    menu.className = 'context-menu fade-in';
    menu.style.top = `${e.clientY}px`;
    menu.style.left = `${e.clientX}px`;

    const items = [];
    const isStaff = state.currentUser && ['developer', 'maintainer', 'owner'].includes(state.currentUser.role);
    if (!isStaff) return;

    if (node.type === 'empty') {
        // Root creation group
        items.push({ 
            icon: 'folder', 
            label: t('root_folder'), 
            submenu: [
                { icon: 'file-plus', label: t('menu_new_file'), cmd: 'new-file', path: '' },
                { icon: 'folder-plus', label: t('menu_new_folder'), cmd: 'new-folder', path: '' }
            ]
        });
        
        // Flattened repos creation groups
        const flattened = state.repos.filter(r => r.flatten_in_tree);
        if (flattened.length > 0) {
            flattened.forEach(repo => {
                items.push({ 
                    icon: 'git-branch', 
                    label: repo.name, 
                    submenu: [
                        { icon: 'file-plus', label: t('menu_new_file'), cmd: 'new-file', path: repo.slug },
                        { icon: 'folder-plus', label: t('menu_new_folder'), cmd: 'new-folder', path: repo.slug }
                    ]
                });
            });
        }
    } else {
        const parentPath = node.type === 'folder' ? node.path : node.path.split('/').slice(0, -1).join('/');
        
        items.push({ icon: 'file-plus', label: t('menu_new_file'), cmd: 'new-file', path: parentPath });
        items.push({ icon: 'folder-plus', label: t('menu_new_folder'), cmd: 'new-folder', path: parentPath });
        items.push({ divider: true });
        items.push({ icon: 'edit', label: t('menu_rename') || 'Rename', cmd: 'rename' });
        items.push({ icon: 'move', label: t('menu_move') || 'Move', cmd: 'move' });
        
        if (node.type === 'file') {
            items.push({ 
                icon: 'activity', 
                label: t('status_label') || 'Status', 
                submenu: [
                    { icon: 'circle', label: t('status_draft'), cmd: 'status-draft' },
                    { icon: 'play-circle', label: t('status_in_progress'), cmd: 'status-in_progress' },
                    { icon: 'check-circle', label: t('status_published'), cmd: 'status-published' }
                ]
            });
        }

        items.push({
            icon: node.public ? 'eye' : 'lock',
            label: t('vis_label') || 'Visibility',
            submenu: [
                { icon: 'eye', label: t('vis_public'), cmd: 'vis-public' },
                { icon: 'lock', label: t('vis_private'), cmd: 'vis-private' }
            ]
        });

        items.push({ icon: 'trash-2', label: t('menu_delete') || 'Delete', cmd: 'delete', danger: true });
    }

    items.forEach(it => {
        if (it.divider) {
            const div = document.createElement('div');
            div.className = 'context-menu-divider';
            menu.appendChild(div);
            return;
        }
        const item = document.createElement('div');
        item.className = `context-menu-item ${it.danger ? 'danger' : ''} ${it.submenu ? 'has-submenu' : ''}`;
        item.innerHTML = `<i data-lucide="${it.icon}" class="icon-sm"></i> <span>${it.label}</span>`;
        
        if (it.submenu) {
            const sub = document.createElement('div');
            sub.className = 'submenu';
            it.submenu.forEach(sit => {
                const sitem = document.createElement('div');
                sitem.className = 'context-menu-item';
                const sIcon = sit.icon ? `<i data-lucide="${sit.icon}" class="icon-sm"></i> ` : '';
                sitem.innerHTML = `${sIcon}<span>${sit.label}</span>`;
                sitem.onclick = (ev) => {
                    ev.stopPropagation();
                    handleMenuCommand(sit.cmd, node, sit.path !== undefined ? sit.path : it.path);
                    menu.remove();
                };
                sub.appendChild(sitem);
            });
            item.appendChild(sub);
        } else {
            item.onclick = () => {
                handleMenuCommand(it.cmd, node, it.path);
                menu.remove();
            };
        }
        menu.appendChild(item);
    });

    document.body.appendChild(menu);
    if (window.lucide) lucide.createIcons();

    // Close on click outside
    const closeMenu = (ev) => {
        if (!menu.contains(ev.target)) {
            menu.remove();
            document.removeEventListener('mousedown', closeMenu);
        }
    };
    document.addEventListener('mousedown', closeMenu);
}
