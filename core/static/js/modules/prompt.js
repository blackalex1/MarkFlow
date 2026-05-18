import { t } from './i18n.js';

export async function promptAction(title, message, placeholder = '', confirmText = 'OK', cancelText = 'Cancel', isPassword = false, selectOptions = null, isTreeSelect = false, excludePath = null) {
    return new Promise(async (resolve) => {
        const modal = document.getElementById('prompt-modal');
        const content = modal?.querySelector('.modal-content');
        const titleEl = document.getElementById('prompt-title');
        const msgEl = document.getElementById('prompt-message');
        const inputEl = document.getElementById('prompt-input');
        const treeContainer = document.getElementById('prompt-tree-container');
        const btnConfirm = document.getElementById('prompt-btn-confirm');
        const btnCancel = document.getElementById('prompt-btn-cancel');

        if (!modal || !inputEl) {
            resolve(prompt(message));
            return;
        }

        titleEl.innerText = title;
        msgEl.innerText = message;
        
        btnConfirm.innerText = confirmText;
        btnCancel.innerText = cancelText;
        
        let selectedFolder = '';
        
        if (isTreeSelect && treeContainer) {
            inputEl.classList.add('hidden');
            treeContainer.classList.remove('hidden');
            treeContainer.innerHTML = `<div style="color: var(--text-muted); padding: 20px; font-size: 13px; text-align: center;">${t('loading') || 'Loading folders...'}</div>`;
            
            try {
                // 1. Fetch File Tree
                const treeRes = await fetch('/api/files/tree');
                const treeData = await treeRes.json();
                
                // 2. Filter folders only and exclude self-nesting paths
                const filterFolders = (nodes) => {
                    return nodes
                        .filter(n => n.type === 'folder' && n.path !== excludePath && !n.path.startsWith(excludePath + '/'))
                        .map(n => ({
                            ...n,
                            children: filterFolders(n.children || [])
                        }));
                };
                const folderTree = filterFolders(treeData.tree || []);
                
                treeContainer.innerHTML = '';
                
                // 3. Render Root folder option
                const rootItem = document.createElement('div');
                rootItem.className = 'folder-item active'; // Pre-selected by default
                rootItem.style.paddingLeft = '10px';
                rootItem.style.cursor = 'pointer';
                rootItem.style.display = 'flex';
                rootItem.style.alignItems = 'center';
                rootItem.style.gap = '8px';
                rootItem.style.padding = '8px 12px';
                rootItem.style.borderRadius = '6px';
                rootItem.innerHTML = `<i data-lucide="folder" class="icon-sm"></i> <span style="font-weight: 600;">${t('root_folder') || 'Root Documents'}</span>`;
                treeContainer.appendChild(rootItem);
                
                selectedFolder = '';
                let preselectedEl = rootItem;
                
                const selectItem = (el, path) => {
                    treeContainer.querySelectorAll('.folder-item').forEach(item => item.classList.remove('active'));
                    el.classList.add('active');
                    selectedFolder = path;
                };
                
                rootItem.onclick = (e) => {
                    e.stopPropagation();
                    selectItem(rootItem, '');
                };
                
                // 4. Render folders recursively
                const renderFolderNode = (nodes, parentEl, level = 1) => {
                    nodes.forEach(node => {
                        const item = document.createElement('div');
                        item.className = 'folder-item';
                        item.style.paddingLeft = `${level * 15 + 10}px`;
                        item.style.cursor = 'pointer';
                        item.style.display = 'flex';
                        item.style.alignItems = 'center';
                        item.style.gap = '8px';
                        item.style.padding = '6px 12px';
                        item.style.borderRadius = '6px';
                        
                        const hasChildren = node.children && node.children.length > 0;
                        const chevronIcon = hasChildren ? '<i data-lucide="chevron-right" class="icon-sm chevron" style="cursor: pointer;"></i> ' : '<span style="width: 16px; display: inline-block;"></span>';
                        
                        item.innerHTML = `${chevronIcon}<i data-lucide="folder" class="icon-sm"></i> <span style="flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${node.name}</span>`;
                        
                        const childrenContainer = document.createElement('div');
                        childrenContainer.className = 'children hidden';
                        childrenContainer.style.display = 'flex';
                        childrenContainer.style.flexDirection = 'column';
                        childrenContainer.style.gap = '2px';
                        
                        // Pre-select if matches the placeholder (current parent folder)
                        if (node.path === placeholder) {
                            preselectedEl = item;
                            selectedFolder = node.path;
                        }
                        
                        item.onclick = (e) => {
                            e.stopPropagation();
                            const isChevronClick = e.target.classList.contains('chevron') || e.target.closest('.chevron');
                            if (isChevronClick && hasChildren) {
                                const isHidden = childrenContainer.classList.contains('hidden');
                                const chev = item.querySelector('.chevron');
                                if (isHidden) {
                                    childrenContainer.classList.remove('hidden');
                                    item.classList.add('open');
                                    if (chev) chev.style.transform = 'rotate(90deg)';
                                } else {
                                    childrenContainer.classList.add('hidden');
                                    item.classList.remove('open');
                                    if (chev) chev.style.transform = '';
                                }
                                return;
                            }
                            selectItem(item, node.path);
                        };
                        
                        item.ondblclick = (e) => {
                            e.stopPropagation();
                            if (hasChildren) {
                                const isHidden = childrenContainer.classList.contains('hidden');
                                const chev = item.querySelector('.chevron');
                                if (isHidden) {
                                    childrenContainer.classList.remove('hidden');
                                    item.classList.add('open');
                                    if (chev) chev.style.transform = 'rotate(90deg)';
                                } else {
                                    childrenContainer.classList.add('hidden');
                                    item.classList.remove('open');
                                    if (chev) chev.style.transform = '';
                                }
                            }
                        };
                        
                        parentEl.appendChild(item);
                        if (hasChildren) {
                            parentEl.appendChild(childrenContainer);
                            renderFolderNode(node.children, childrenContainer, level + 1);
                        }
                    });
                };
                
                renderFolderNode(folderTree, treeContainer);
                
                // Highlight and auto-expand nested parent paths for pre-selected folder
                if (preselectedEl) {
                    selectItem(preselectedEl, selectedFolder);
                    let parent = preselectedEl.parentElement;
                    while (parent && parent !== treeContainer) {
                        if (parent.classList.contains('children')) {
                            parent.classList.remove('hidden');
                            const folderItem = parent.previousElementSibling;
                            if (folderItem && folderItem.classList.contains('folder-item')) {
                                folderItem.classList.add('open');
                                const chev = folderItem.querySelector('.chevron');
                                if (chev) chev.style.transform = 'rotate(90deg)';
                            }
                        }
                        parent = parent.parentElement;
                    }
                }
                
                if (window.lucide) lucide.createIcons({ container: treeContainer });
            } catch (err) {
                console.error("Failed to load folders for selector modal:", err);
                treeContainer.innerHTML = `<div style="color: var(--status-red); padding: 20px; font-size: 13px; text-align: center;">Failed to load folders.</div>`;
            }
        } else {
            if (treeContainer) treeContainer.classList.add('hidden');
            inputEl.classList.remove('hidden');
            inputEl.value = placeholder;
            inputEl.placeholder = '';
            inputEl.type = isPassword ? 'password' : 'text';
            setTimeout(() => inputEl.focus(), 50);
        }
        
        modal.classList.remove('hidden');
        modal.classList.add('fade-in');
        if (content) content.classList.add('animate-pop');

        const cleanup = (result) => {
            modal.classList.add('hidden');
            modal.classList.remove('fade-in');
            if (content) content.classList.remove('animate-pop');
            btnConfirm.onclick = null;
            btnCancel.onclick = null;
            modal.onclick = null;
            inputEl.onkeydown = null;
            if (treeContainer) {
                treeContainer.classList.add('hidden');
                treeContainer.innerHTML = '';
            }
            resolve(result);
        };

        btnConfirm.onclick = () => {
            if (isTreeSelect) {
                cleanup(selectedFolder);
            } else {
                const val = inputEl.value.trim();
                cleanup(val || null);
            }
        };

        btnCancel.onclick = () => {
            cleanup(null);
        };

        modal.onclick = (e) => {
            if (e.target === modal) cleanup(null);
        };

        const handleKey = (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                btnConfirm.click();
            }
            if (e.key === 'Escape') {
                e.preventDefault();
                btnCancel.click();
            }
        };

        inputEl.onkeydown = handleKey;
    });
}

window.promptAction = promptAction;
