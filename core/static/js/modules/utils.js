import { ui, state } from './ui.js';
import * as viewer from './viewer.js';
import { initMarkdownComponentHandlers } from './viewer/handlers.js';

export function initGlobalHandlers() {
    initMarkdownComponentHandlers();

    window.addEventListener('click', (e) => {
        // Intercept all clicks on .md links
        const link = e.target.closest('a');
        if (link && link.href) {
            const url = new URL(link.href);
            let path = url.searchParams.get('p');
            const isLocal = url.origin === window.location.origin;
            if (!path && isLocal && url.pathname.endsWith('.md')) {
                path = decodeURIComponent(url.pathname.substring(1));
            }
            const isMd = path && path.endsWith('.md');
            
            if (isLocal && isMd) {
                // If it's just an anchor on the same page, don't reload everything
                const currentPath = state.currentFilePath;
                if (path === currentPath && url.hash) {
                    return; // Let the default anchor behavior or specialized handlers work
                }
                
                e.preventDefault();
                viewer.loadFileContent(path, true, url.hash ? url.hash.substring(1) : null);
                
                // On mobile, close sidebar after clicking a link
                if (window.innerWidth <= 1024) {
                    toggleSidebar(false);
                }
            }
        }
    });

    // Go Home handler
    window.addEventListener('go-home', () => {
        viewer.renderWelcomePage();
    });

    // Load file handler
    window.addEventListener('load-file', (e) => {
        const { path, hash } = e.detail;
        viewer.loadFileContent(path, true, hash);
    });
}

export function toggleSidebar(force) {
    const active = typeof force === 'boolean' ? force : !state.isSidebarActive;
    state.isSidebarActive = active;
    
    if (ui.sidebar) {
        ui.sidebar.classList.toggle('active', active);
    }
    
    if (ui.mobileToggle) {
        const icon = ui.mobileToggle.querySelector('i');
        if (icon) {
            icon.setAttribute('data-lucide', active ? 'x' : 'menu');
            if (window.lucide) lucide.createIcons();
        }
    }
}

export function initSidebar() {
    if (ui.sidebarTitle) {
        ui.sidebarTitle.onclick = () => window.dispatchEvent(new CustomEvent('go-home'));
    }
}

export function initMobileToggle() {
    if (ui.mobileToggle) {
        ui.mobileToggle.onclick = (e) => {
            e.stopPropagation();
            toggleSidebar();
        };
    }

    // Close sidebar when clicking outside on mobile
    document.addEventListener('click', (e) => {
        if (state.isSidebarActive && window.innerWidth <= 1024) {
            if (ui.sidebar && !ui.sidebar.contains(e.target) && !ui.mobileToggle.contains(e.target)) {
                toggleSidebar(false);
            }
        }
    });
}
