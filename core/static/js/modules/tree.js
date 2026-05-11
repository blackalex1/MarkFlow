import { ui, state } from './ui.js';
import { toast } from './toasts.js';
import { t } from './i18n.js';
import { API } from './api.js';
import { escapeHTML } from './security.js';
import { getStatusColor, getStatusName } from './status.js';

export async function loadFileTree() {
    // 1. Fetch File Tree (Available to guests)
    const treeRes = await fetch(API.FILE_TREE);
    const treeData = await treeRes.json();
    state.flattenedSlugs = treeData.flattened_slugs || [];
    
    // 2. Fetch Repos only if user is Staff (for context menus)
    const isStaff = state.currentUser && ['developer', 'maintainer', 'owner'].includes(state.currentUser.role);
    if (isStaff) {
        try {
            const reposRes = await fetch(API.GIT_REPOS);
            if (reposRes.ok) {
                const reposData = await reposRes.json();
                state.repos = Array.isArray(reposData) ? reposData : (reposData.repos || []);
            }
        } catch (err) {
            console.error("Failed to load repos:", err);
            state.repos = [];
        }
    } else {
        state.repos = [];
    }

    renderFileTree(treeData.tree);
}

function renderFileTree(tree) {
    ui.fileTree.innerHTML = '';
    
    function renderNode(nodes, parentEl, level = 0, parentPath = '') {
        nodes.forEach(node => {
            const item = document.createElement('div');
            const nodePath = node.path || (parentPath ? `${parentPath}/${node.name}` : node.name);
            item.className = node.type === 'folder' ? 'folder-item' : 'file-item';
            item.style.paddingLeft = `${level * 15 + 10}px`;
            
            if (node.type === 'folder') {
                const isOpen = state.openFolders.has(nodePath);
                const escapedName = escapeHTML(node.name);
                item.innerHTML = `<i data-lucide="chevron-right" class="icon-sm chevron"></i> <i data-lucide="folder" class="icon-sm"></i> <span>${escapedName}</span>`;
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
                    const color = getStatusColor(status);
                    const statusTitle = getStatusName(status);
                    statusDot = `<span class="status-dot" style="background-color: ${color};" title="${statusTitle}"></span>`;
                }

                const escapedName = escapeHTML(node.name.replace('.md', ''));
                item.innerHTML = `${statusDot}<i data-lucide="${icon}" class="icon-sm"></i> <span>${escapedName}</span>`;
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
    
    // Context menu on empty space
    ui.fileTree.oncontextmenu = (e) => {
        const isStaff = state.currentUser && ['developer', 'maintainer', 'owner'].includes(state.currentUser.role);
        if (!isStaff) return;
        if (e.target !== ui.fileTree) return; // Only trigger if clicking exactly on the container
        
        e.preventDefault();
        showContextMenu(e, { type: 'empty' });
    };

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
        const span = el.querySelector('span');
        files.push({
            path: el.dataset.path,
            name: span ? span.textContent : (el.dataset.path.split('/').pop() || 'Unknown')
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

async function handleMenuCommand(cmd, node, contextPath = '') {
    if (cmd === 'new-file') {
        const name = await window.promptAction(t('menu_new_file'), t('pages_name_placeholder') || "Enter file name:", '', t('pages_btn_create') || 'OK', t('btn_cancel'));
        if (!name) return;
        const fullPath = contextPath ? `${contextPath}/${name}` : name;
        const res = await fetch(`${API.FILE_CREATE}?path=${encodeURIComponent(fullPath)}`, { method: 'POST' });
        if (res.ok) {
            toast.success(t('toast_save_success'));
            loadFileTree();
            window.dispatchEvent(new CustomEvent('load-file', { detail: { path: fullPath + (fullPath.endsWith('.md') ? '' : '.md') } }));
        } else {
            const err = await res.json();
            toast.error(err.detail || "Failed to create file");
        }
    } else if (cmd === 'new-folder') {
        const name = await window.promptAction(t('menu_new_folder'), t('pages_name_placeholder') || "Enter folder name:", '', t('pages_btn_create') || 'OK', t('btn_cancel'));
        if (!name) return;
        const fullPath = contextPath ? `${contextPath}/${name}` : name;
        const res = await fetch(`${API.FILE_MKDIR}?path=${encodeURIComponent(fullPath)}`, { method: 'POST' });
        if (res.ok) {
            toast.success(t('type_folder') + " created");
            loadFileTree();
        } else {
            const err = await res.json();
            toast.error(err.detail || "Failed to create folder");
        }
    } else if (cmd === 'delete') {
        const typeStr = node.type === 'folder' ? (t('type_folder') || 'folder') : (t('type_file') || 'file');
        const confirmed = await window.confirmAction(
            t('confirm_delete_title') || 'Confirm Delete',
            `${t('confirm_delete_msg') || 'Are you sure you want to delete'} ${typeStr} "${node.name}"?`,
            t('btn_delete') || 'Delete',
            t('btn_cancel') || 'Cancel'
        );
        if (confirmed) {
            const res = await fetch(`${API.FILE_DELETE}?path=${encodeURIComponent(node.path)}`, { method: 'DELETE' });
            if (res.ok) {
                const typeStr = node.type === 'folder' ? (t('type_folder') || 'folder') : (t('type_file') || 'file');
                toast.success(`${typeStr} ${t('toast_delete_success') || 'deleted'}`);
                loadFileTree();
                if (node.path === state.currentFilePath) {
                    location.href = '/';
                }
            } else {
                toast.error(t('toast_delete_failed') || "Failed to delete");
            }
        }
    } else if (cmd === 'rename' || cmd === 'move') {
        const newPath = await window.promptAction(t('menu_rename') || 'Rename', `Enter new path for ${node.name}:`, node.path, t('btn_save'), t('btn_cancel'));
        if (!newPath || newPath === node.path) return;
        
        const res = await fetch(API.FILE_MOVE, {
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
        const res = await fetch(`${API.FILE_STATUS}?path=${encodeURIComponent(node.path)}`, {
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
        const res = await fetch(`${API.FILE_VISIBILITY}?path=${encodeURIComponent(node.path)}`, {
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
