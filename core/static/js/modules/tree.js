import { ui, state } from './ui.js';
import { toast } from './toasts.js';

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
                
                item.onclick = (e) => {
                    e.stopPropagation();
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
                    if (window.lucide) lucide.createIcons();
                };

                item.oncontextmenu = (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    showContextMenu(e, { path: nodePath, type: 'folder', name: node.name });
                };
                
                parentEl.appendChild(item);
                parentEl.appendChild(childrenContainer);
                renderNode(node.children, childrenContainer, level + 1, nodePath);
            } else {
                item.dataset.path = node.path;
                const icon = node.public ? 'file-text' : 'lock';
                item.innerHTML = `<i data-lucide="${icon}" class="icon-sm"></i> <span>${node.name.replace('.md', '')}</span>`;
                if (node.path === state.currentFilePath) item.classList.add('active');
                
                item.onclick = (e) => {
                    e.stopPropagation();
                    window.dispatchEvent(new CustomEvent('load-file', { detail: { path: node.path } }));
                };

                item.oncontextmenu = (e) => {
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
    // Remove existing menu
    const existing = document.querySelector('.context-menu');
    if (existing) existing.remove();

    const menu = document.createElement('div');
    menu.className = 'context-menu fade-in';
    menu.style.top = `${e.clientY}px`;
    menu.style.left = `${e.clientX}px`;

    const items = [
        { icon: 'edit', label: 'Rename', cmd: 'rename' },
        { icon: 'move', label: 'Move', cmd: 'move' },
        { icon: 'trash-2', label: 'Delete', cmd: 'delete', danger: true }
    ];

    items.forEach(it => {
        const item = document.createElement('div');
        item.className = `context-menu-item ${it.danger ? 'danger' : ''}`;
        item.innerHTML = `<i data-lucide="${it.icon}" class="icon-sm"></i> <span>${it.label}</span>`;
        item.onclick = () => {
            handleMenuCommand(it.cmd, node);
            menu.remove();
        };
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
        if (confirm(`Delete ${node.type} "${node.name}"?`)) {
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
    }
}
