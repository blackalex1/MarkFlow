import { ui, state } from './ui.js';

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
                item.innerHTML = `<i data-lucide="${isOpen ? 'chevron-down' : 'chevron-right'}" class="icon-sm"></i> <i data-lucide="folder" class="icon-sm"></i> <span>${node.name}</span>`;
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
