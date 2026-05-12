import { ui, state } from '../ui.js';
import * as tree from '../tree.js';
import { t } from '../i18n.js';

export function updateBreadcrumbs(path) {
    if (!ui.breadcrumb) return;
    ui.breadcrumb.innerHTML = '';
    
    const homeWrapper = document.createElement('span');
    homeWrapper.className = 'breadcrumb-home-wrapper';
    homeWrapper.style.cursor = 'pointer';
    homeWrapper.style.display = 'inline-flex';
    homeWrapper.addEventListener('click', () => window.dispatchEvent(new CustomEvent('go-home')));
    
    const homeIcon = document.createElement('i');
    homeIcon.setAttribute('data-lucide', 'home');
    homeIcon.className = 'breadcrumb-home-icon';
    homeWrapper.appendChild(homeIcon);
    
    ui.breadcrumb.appendChild(homeWrapper);

    const homePath = state.homePagePath || "system/home.md";
    if (!path || path === homePath) {
        if (window.lucide) lucide.createIcons({ container: ui.breadcrumb });
        return;
    }

    const parts = path.split('/');

    let currentPath = '';
    parts.forEach((part, index) => {
        if (!part) return;
        
        const isFlattenedRepo = index === 0 && state.flattenedSlugs.includes(part);
        currentPath += (index > 0 ? '/' : '') + part;
        const thisPath = currentPath;
        
        if (isFlattenedRepo) return; // Skip rendering this segment
        
        const sep = document.createElement('span');
        sep.className = 'breadcrumb-separator';
        sep.textContent = '›';
        ui.breadcrumb.appendChild(sep);

        const span = document.createElement('span');
        const isLast = index === parts.length - 1;
        span.className = isLast ? 'breadcrumb-current' : 'breadcrumb-folder';
        span.textContent = part.replace('.md', '');
        
        if (!isLast) {
            span.addEventListener('click', () => {
                window.dispatchEvent(new CustomEvent('load-file', { detail: { path: thisPath } }));
                // Also ensure the folder is expanded in the tree if it's a folder
                if (!part.endsWith('.md')) {
                    state.openFolders.add(thisPath);
                    tree.loadFileTree();
                }
            });
        }
        ui.breadcrumb.appendChild(span);
    });

    if (window.lucide) lucide.createIcons({ container: ui.breadcrumb });
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
        ui.navPrev.addEventListener('click', () => window.dispatchEvent(new CustomEvent('load-file', { detail: { path: prev.path } })), { once: true });
    } else ui.navPrev.classList.add('hidden');
    
    if (next) {
        ui.navNext.classList.remove('hidden');
        ui.navNext.querySelector('.nav-title').textContent = next.name;
        ui.navNext.addEventListener('click', () => window.dispatchEvent(new CustomEvent('load-file', { detail: { path: next.path } })), { once: true });
    } else ui.navNext.classList.add('hidden');
    
    if (window.lucide) lucide.createIcons({ container: ui.pageNav });
}
