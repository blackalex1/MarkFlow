import { ui, state } from './ui.js';
import { toast } from './toasts.js';
import { t } from './i18n.js';

export async function loadFileTree() {
    const res = await fetch('/api/files/tree');
    const data = await res.json();
    renderFileTree(data.tree);
}

function renderFileTree(tree) {
    ui.fileTree.innerHTML = '';
    
    function renderNode(nodes, parentEl, level = 0, parentPath = '') {
        nodes.forEach(node => {
            const item = document.createElement('div');
            const nodePath = parentPath ? `${parentPath}/${node.name}` : node.name;
            item.className = node.type === 'folder' ? 'folder-item' : 'file-item';
            item.style.paddingLeft = `${level * 15 + 10}px`;
            
            if (node.type === 'folder') {
                const isOpen = state.openFolders.has(nodePath);
                item.innerHTML = `<i data-lucide="chevron-right" class="icon-sm chevron"></i> <i data-lucide="folder" class="icon-sm"></i> <span>${node.name}</span>`;
                if (isOpen) item.classList.add('open');
                
                const childrenContainer = document.createElement('div');
                childrenContainer.className = 'children' + (isOpen ? '' : ' hidden');
                
                item.onclick = async (e) => {
                    e.stopPropagation();
                    const { loadFolderContent } = await import('./viewer.js');
                    loadFolderContent(nodePath);
                    
                    const isHidden = childrenContainer.classList.contains('hidden');
                    if (isHidden) {
                        childrenContainer.classList.remove('hidden');
                        item.classList.add('open');
                        state.openFolders.add(nodePath);
                    } else {
                        childrenContainer.classList.add('hidden');
                        item.classList.remove('open');
                        state.openFolders.delete(nodePath);
                    }
                };

                const isStaff = state.currentUser && ['developer', 'maintainer', 'owner'].includes(state.currentUser.role);
                item.oncontextmenu = (e) => {
                    if (!isStaff) return;
                    e.preventDefault();
                    e.stopPropagation();
                    showContextMenu(e, { path: nodePath, type: 'folder', name: node.name });
                };
                
                parentEl.appendChild(item);
                parentEl.appendChild(childrenContainer);
                renderNode(node.children, childrenContainer, level + 1, nodePath);
            } else {
                item.dataset.path = node.path;
                // Icon shows Visibility
                const icon = node.public ? 'file-text' : 'lock';
                
                // Dot shows Status
                const isStaff = state.currentUser && ['developer', 'maintainer', 'owner'].includes(state.currentUser.role);
                let statusDot = '';
                if (isStaff) {
                    const status = node.status || 'published';
                    // Status colors: Draft (Gray), In Progress (Blue), Published (Green)
                    let statusClass = status === 'published' ? 'public' : status; 
                    const statusTitle = t(`status_${status}`);
                    statusDot = `<span class="status-dot ${statusClass}" title="${statusTitle}"></span>`;
                }

                item.innerHTML = `${statusDot}<i data-lucide="${icon}" class="icon-sm"></i> <span>${node.name.replace('.md', '')}</span>`;
                if (node.path === state.currentFilePath) item.classList.add('active');
                
                item.onclick = (e) => {
                    e.stopPropagation();
                    window.dispatchEvent(new CustomEvent('load-file', { detail: { path: node.path } }));
                };

                item.oncontextmenu = (e) => {
                    if (!isStaff) return;
                    e.preventDefault();
                    e.stopPropagation();
                    showContextMenu(e, { path: node.path, type: 'file', name: node.name });
                };
                parentEl.appendChild(item);
            }
        });
    }
    
    renderNode(tree, ui.fileTree);
    if (window.lucide) lucide.createIcons();
}

export function updateTreeHighlighting(activePath) {
    document.querySelectorAll('.file-item').forEach(el => {
        if (el.dataset.path === activePath) {
            el.classList.add('active');
        } else {
            el.classList.remove('active');
        }
    });
}

export function getAllFiles() {
    const files = [];
    document.querySelectorAll('.file-item').forEach(el => {
        files.push({
            path: el.dataset.path,
            name: el.querySelector('span').textContent
        });
    });
    return files;
}

function showContextMenu(e, node) {
    const existing = document.querySelector('.context-menu');
    if (existing) existing.remove();
    const menu = document.createElement('div');
    menu.className = 'context-menu fade-in';
    menu.style.top = `${e.clientY}px`;
    menu.style.left = `${e.clientX}px`;

    const items = [
        { icon: 'edit', label: t('menu_rename') || 'Rename', cmd: 'rename' },
        { icon: 'move', label: t('menu_move') || 'Move', cmd: 'move' }
    ];

    if (node.type === 'file') {
        items.push({ 
            icon: 'activity', 
            label: t('status_label') || 'Status', 
            submenu: [
                { label: t('status_draft'), cmd: 'status-draft' },
                { label: t('status_in_progress'), cmd: 'status-in_progress' },
                { label: t('status_published'), cmd: 'status-published' }
            ]
        });
    }

    items.push({
        icon: node.public ? 'eye' : 'lock',
        label: t('vis_label') || 'Visibility',
        submenu: [
            { label: t('vis_public'), cmd: 'vis-public' },
            { label: t('vis_private'), cmd: 'vis-private' }
        ]
    });

    items.push({ icon: 'trash-2', label: t('menu_delete') || 'Delete', cmd: 'delete', danger: true });

    items.forEach(it => {
        const item = document.createElement('div');
        item.className = `context-menu-item ${it.danger ? 'danger' : ''} ${it.submenu ? 'has-submenu' : ''}`;
        item.innerHTML = `<i data-lucide="${it.icon}" class="icon-sm"></i> <span>${it.label}</span>`;
        
        if (it.submenu) {
            const sub = document.createElement('div');
            sub.className = 'submenu';
            it.submenu.forEach(sit => {
                const sitem = document.createElement('div');
                sitem.className = 'context-menu-item';
                sitem.textContent = sit.label;
                sitem.onclick = (ev) => {
                    ev.stopPropagation();
                    handleMenuCommand(sit.cmd, node);
                    menu.remove();
                };
                sub.appendChild(sitem);
            });
            item.appendChild(sub);
        } else {
            item.onclick = () => {
                handleMenuCommand(it.cmd, node);
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

async function handleMenuCommand(cmd, node) {
    if (cmd === 'delete') {
        const typeStr = node.type === 'folder' ? (t('type_folder') || 'folder') : (t('type_file') || 'file');
        const confirmed = await window.confirmAction(
            t('confirm_delete_title') || 'Confirm Delete',
            `${t('confirm_delete_msg') || 'Are you sure you want to delete'} ${typeStr} "${node.name}"?`,
            t('btn_delete') || 'Delete',
            t('btn_cancel') || 'Cancel'
        );
        if (confirmed) {
            const res = await fetch(`/api/files/delete?path=${encodeURIComponent(node.path)}`, { method: 'DELETE' });
            if (res.ok) {
                toast.success(`${node.type} deleted`);
                loadFileTree();
                if (node.path === state.currentFilePath) {
                    location.href = '/';
                }
            } else {
                toast.error("Failed to delete");
            }
        }
    } else if (cmd === 'rename' || cmd === 'move') {
        const newPath = prompt(`Enter new path for ${node.name}:`, node.path);
        if (!newPath || newPath === node.path) return;
        
        const res = await fetch(`/api/files/move`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ old_path: node.path, new_path: newPath })
        });
        
        if (res.ok) {
            toast.success("Path updated");
            loadFileTree();
            if (node.path === state.currentFilePath) {
                window.dispatchEvent(new CustomEvent('load-file', { detail: { path: newPath } }));
            }
        } else {
            const err = await res.json();
            toast.error(err.detail || "Failed to move");
        }
    } else if (cmd.startsWith('status-')) {
        const status = cmd.replace('status-', '');
        const res = await fetch(`/api/files/status?path=${encodeURIComponent(node.path)}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ status })
        });
        if (res.ok) {
            toast.success(`${t('status_updated') || 'Status updated to'} ${t(`status_${status}`)}`);
            loadFileTree();
            // Trigger refresh in viewer if active
            if (node.path === state.currentFilePath) {
                window.dispatchEvent(new CustomEvent('load-file', { detail: { path: node.path } }));
            }
        } else {
            toast.error("Failed to update status");
        }
    } else if (cmd.startsWith('vis-')) {
        const isPublic = cmd === 'vis-public';
        const res = await fetch(`/api/files/visibility?path=${encodeURIComponent(node.path)}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ public: isPublic })
        });
        if (res.ok) {
            const typeStr = node.type === 'folder' ? (t('type_folder') || 'Folder') : (t('type_file') || 'File');
            toast.success(`${typeStr} ${isPublic ? (t('vis_public') || 'is now public') : (t('vis_private') || 'is now private')}`);
            loadFileTree();
            if (node.path === state.currentFilePath) {
                window.dispatchEvent(new CustomEvent('load-file', { detail: { path: node.path } }));
            }
        } else {
            toast.error("Failed to update visibility");
        }
    }
}
