import { ui, state } from './ui.js';
import { toast } from './toasts.js';
import { t } from './i18n.js';
import { API } from './api.js';
import { escapeHTML } from './security.js';
import { getStatusColor, getStatusName } from './status.js';
import { showContextMenu } from './tree/menu.js';

export async function loadFileTree() {
    // 1. Fetch File Tree (Available to guests)
    const treeRes = await fetch(`${API.FILE_TREE}?hide_empty=true`);
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
            item.dataset.path = nodePath;
            item.style.paddingLeft = `${level * 15 + 10}px`;
            
            if (node.type === 'folder') {
                const isOpen = state.openFolders.has(nodePath);
                const escapedName = escapeHTML(node.name);
                item.innerHTML = `<i data-lucide="chevron-right" class="icon-sm chevron"></i> <i data-lucide="folder" class="icon-sm"></i> <span>${escapedName}</span>`;
                if (isOpen) item.classList.add('open');
                
                const childrenContainer = document.createElement('div');
                childrenContainer.className = 'children' + (isOpen ? '' : ' hidden');
                
                item.addEventListener('click', async (e) => {
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
                });

                const isStaff = state.currentUser && ['developer', 'maintainer', 'owner'].includes(state.currentUser.role);
                item.addEventListener('contextmenu', (e) => {
                    if (!isStaff) return;
                    e.preventDefault();
                    e.stopPropagation();
                    showContextMenu(e, { path: nodePath, type: 'folder', name: node.name });
                });
                
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
                
                item.addEventListener('click', (e) => {
                    e.stopPropagation();
                    window.dispatchEvent(new CustomEvent('load-file', { detail: { path: node.path } }));
                });

                item.addEventListener('contextmenu', (e) => {
                    if (!isStaff) return;
                    e.preventDefault();
                    e.stopPropagation();
                    showContextMenu(e, { path: node.path, type: 'file', name: node.name });
                });
                parentEl.appendChild(item);
            }
        });
    }
    
    renderNode(tree, ui.fileTree);
    
    // Context menu on empty space
    ui.fileTree.addEventListener('contextmenu', (e) => {
        const isStaff = state.currentUser && ['developer', 'maintainer', 'owner'].includes(state.currentUser.role);
        if (!isStaff) return;
        if (e.target !== ui.fileTree) return; // Only trigger if clicking exactly on the container
        
        e.preventDefault();
        showContextMenu(e, { type: 'empty' });
    });

    if (window.lucide) lucide.createIcons();
}

export function updateTreeHighlighting(activePath) {
    if (!ui.fileTree) return;
    
    // 1. Remove active class from previously active items
    ui.fileTree.querySelectorAll('.file-item.active').forEach(el => {
        el.classList.remove('active');
    });
    
    // 2. Add active class to the new item
    // Use attribute selector which is faster than iterating all items
    const newItem = ui.fileTree.querySelector(`.file-item[data-path="${activePath.replace(/"/g, '\\"')}"]`);
    if (newItem) {
        newItem.classList.add('active');
    }
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

export function getAllFolders() {
    const folders = [{ path: '', name: t('root_folder') || 'Root' }];
    document.querySelectorAll('.folder-item').forEach(el => {
        folders.push({
            path: el.dataset.path,
            name: el.dataset.path
        });
    });
    return folders;
}
