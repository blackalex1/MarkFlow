import { ui, state } from './ui.js';
import * as tree from './tree.js';
import { loadFileContent } from './viewer.js';
import { t } from './i18n.js';

export function renderFolderGrid(data) {
    ui.contentViewer.innerHTML = `
        <div class="folder-view fade-in">
            <h1 class="folder-view-title">${data.name}</h1>
            <div class="folder-grid">
                ${data.items.map(item => {
                    const icon = item.type === 'folder' ? 'folder' : (item.public ? 'file-text' : 'lock');
                    const isStaff = state.currentUser && ['developer', 'maintainer', 'owner'].includes(state.currentUser.role);
                    let statusDot = '';
                    if (isStaff && item.type === 'file') {
                        const status = item.status || 'published';
                        let statusClass = status === 'published' ? 'public' : status;
                        statusDot = `<span class="status-dot ${statusClass}"></span>`;
                    }
                    
                    return `
                        <div class="folder-card ${item.type}-card" onclick="window.dispatchEvent(new CustomEvent('load-file', { detail: { path: '${item.path}' } }))">
                            <div class="card-icon">
                                ${statusDot}
                                <i data-lucide="${icon}"></i>
                            </div>
                            <div class="card-info">
                                <span class="card-name">${item.name.replace('.md', '')}</span>
                                <span class="card-meta">${item.type === 'folder' ? (t('type_folder') || 'Folder') : (t('type_file') || 'Document')}</span>
                            </div>
                        </div>
                    `;
                }).join('')}
            </div>
        </div>
    `;
    if (window.lucide) lucide.createIcons();
}

export function generateTOC() {
    if (!ui.pageToc || !ui.tocSidebar) return;
    const headers = ui.contentViewer.querySelectorAll('h2, h3, h4');
    if (headers.length < 1) {
        ui.tocSidebar.classList.add('hidden');
        return;
    }
    ui.tocSidebar.classList.remove('hidden');
    ui.pageToc.innerHTML = '';
    const ul = document.createElement('ul');
    headers.forEach(header => {
        if (!header.id) return;
        const li = document.createElement('li');
        const a = document.createElement('a');
        a.href = `#${header.id}`;
        a.textContent = header.textContent;
        a.className = `toc-${header.tagName.toLowerCase()}`;
        a.onclick = (e) => {
            e.preventDefault();
            header.scrollIntoView({ behavior: 'smooth' });
            const url = new URL(window.location);
            url.hash = header.id;
            history.pushState({path: state.currentFilePath}, '', url);
        };
        li.appendChild(a);
        ul.appendChild(li);
    });
    ui.pageToc.appendChild(ul);
}

export function addCopyButtons() {
    ui.contentViewer.querySelectorAll('pre').forEach(pre => {
        if (pre.querySelector('.copy-btn')) return;
        const button = document.createElement('button');
        button.className = 'copy-btn';
        button.innerText = 'Copy';
        button.onclick = () => {
            const code = pre.querySelector('code').innerText;
            navigator.clipboard.writeText(code).then(() => {
                button.innerText = 'Copied!';
                setTimeout(() => button.innerText = 'Copy', 2000);
            });
        };
        pre.appendChild(button);
    });
}

export function updateBreadcrumbs(path) {
    if (!ui.breadcrumb || !path) return;
    const parts = path.split('/');
    ui.breadcrumb.innerHTML = '';
    
    const homeIcon = document.createElement('i');
    homeIcon.setAttribute('data-lucide', 'home');
    homeIcon.className = 'breadcrumb-home-icon';
    homeIcon.style.cursor = 'pointer';
    homeIcon.onclick = () => location.href = '/';
    ui.breadcrumb.appendChild(homeIcon);

    let currentPath = '';
    parts.forEach((part, index) => {
        if (!part) return;
        currentPath += (index > 0 ? '/' : '') + part;
        const thisPath = currentPath;
        
        const sep = document.createElement('span');
        sep.className = 'breadcrumb-separator';
        sep.textContent = '›';
        ui.breadcrumb.appendChild(sep);

        const span = document.createElement('span');
        const isLast = index === parts.length - 1;
        span.className = isLast ? 'breadcrumb-current' : 'breadcrumb-folder';
        span.textContent = part.replace('.md', '');
        
        if (!isLast) {
            span.onclick = () => {
                if (part.endsWith('.md')) {
                    loadFileContent(thisPath);
                } else {
                    state.openFolders.add(thisPath);
                    tree.loadFileTree();
                }
            };
        }
        ui.breadcrumb.appendChild(span);
    });

    if (window.lucide) lucide.createIcons();
}

export function updateNavigation(currentPath) {
    const files = tree.getAllFiles();
    const currentIndex = files.findIndex(f => f.path === currentPath);
    
    if (currentIndex === -1 || files.length <= 1) {
        if (ui.pageNav) ui.pageNav.classList.add('hidden');
        return;
    }
    
    if (!ui.pageNav) return;
    ui.pageNav.classList.remove('hidden');
    
    const prev = files[currentIndex - 1], next = files[currentIndex + 1];
    
    if (prev) {
        ui.navPrev.classList.remove('hidden');
        ui.navPrev.querySelector('.nav-title').textContent = prev.name;
        ui.navPrev.onclick = () => loadFileContent(prev.path);
    } else ui.navPrev.classList.add('hidden');
    
    if (next) {
        ui.navNext.classList.remove('hidden');
        ui.navNext.querySelector('.nav-title').textContent = next.name;
        ui.navNext.onclick = () => loadFileContent(next.path);
    } else ui.navNext.classList.add('hidden');
    
    if (window.lucide) lucide.createIcons();
}
