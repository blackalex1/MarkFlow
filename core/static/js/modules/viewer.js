import { ui, state } from './ui.js';
import { toast } from './toasts.js';
import * as tree from './tree.js';
import { t } from './i18n.js';
import { initMarked, resolveRelativePath, parseMarkdown, resolveHtmlSources } from './markdown.js';
import { generateTOC, updateBreadcrumbs, addCopyButtons, updateNavigation, wrapTables } from './viewer_ui.js';
import { API } from './api.js';
import { updateStatusDisplay } from './status.js';
import { updateURL, renderErrorPage } from './viewer/core.js';

initMarked();

if (window.mermaid) {
    mermaid.initialize({ 
        startOnLoad: false, 
        theme: 'dark',
        securityLevel: 'antiscript',
        fontFamily: 'Inter, system-ui, sans-serif',
        flowchart: { useMaxWidth: false, htmlLabels: true },
        themeVariables: {
            fontSize: '14px'
        }
    });
}

let currentLoadTimeout = null;

export async function loadFileContent(path, pushState = true, hash = null) {
    if (currentLoadTimeout) clearTimeout(currentLoadTimeout);
    
    if (document.body.classList.contains('is-editing') && ui.btnCancel) {
        ui.btnCancel.click();
    }

    try {
        state.currentFilePath = path;
        updateURL(path, pushState, hash);

        // 1. Fetch first (keep old content visible during loading)
        const res = await fetch(`${API.FILE_CONTENT}?path=${encodeURIComponent(path)}`);
        if (!res.ok) throw new Error(res.status);
        
        const data = await res.json();
        if (data.is_folder) return loadFolderContent(path, false);
        
        const cleanHTML = DOMPurify.sanitize(parseMarkdown(data.content), {
            ADD_TAGS: ['mark'],
            ADD_ATTR: ['target', 'data-target', 'data-tab-id', 'data-lucide', 'id', 'class', 'data-code', 'style', 'aria-hidden', 'data-math'],
            USE_PROFILES: { html: true, mathMl: true, svg: true },
            RETURN_TRUSTED_TYPE: true,
            ALLOWED_URI_REGEXP: /^(?:(?:https?|mailto|tel|data|blob):|[^&#:\/?]*(?:[\/?#]|$))/i
        });

        if (data.path) {
            state.currentFilePath = data.path;
            // Update URL to the real resolved path if it changed (fixes duplicate segments in URL)
            if (data.path !== path) {
                updateURL(data.path, false, hash);
            }
        }
        const finalPath = data.path || path;

        // 2. Start the transition only when data is ready
        ui.contentViewer.classList.remove('fade-in');
        ui.contentViewer.classList.add('fade-out');

        const timeout = setTimeout(() => {
            ui.viewModeContainer.classList.remove('hidden');
            ui.contentViewer.innerHTML = cleanHTML;
            resolveHtmlSources(ui.contentViewer, finalPath);
            ui.contentViewer.scrollTop = 0;
            window.scrollTo(0, 0);

            ui.contentViewer.classList.remove('fade-out');
            ui.contentViewer.classList.add('fade-in');

            // Lazy Syntax Highlighting (Performance Guard for Large Docs)
            if (window.hljs) {
                const codeObserver = new IntersectionObserver((entries) => {
                    entries.forEach(entry => {
                        if (entry.isIntersecting) {
                            const block = entry.target;
                            if (!block.dataset.highlighted && !block.classList.contains('language-end')) {
                                hljs.highlightElement(block);
                                block.dataset.highlighted = "true";
                                codeObserver.unobserve(block);
                            }
                        }
                    });
                }, { rootMargin: '100px' });
                
                ui.contentViewer.querySelectorAll('pre code').forEach(b => codeObserver.observe(b));
            }

            // Lazy KaTeX (Targeted Performance Guard)
            if (window.katex) {
                const mathObserver = new IntersectionObserver((entries) => {
                    entries.forEach(entry => {
                        if (entry.isIntersecting) {
                            const el = entry.target;
                            if (!el.dataset.mathRendered) {
                                try {
                                    const isBlock = el.classList.contains('math-tex-block');
                                    katex.render(el.dataset.math, el, {
                                        displayMode: isBlock,
                                        throwOnError: false
                                    });
                                } catch (e) { console.error('KaTeX error:', e); }
                                el.dataset.mathRendered = "true";
                                mathObserver.unobserve(el);
                            }
                        }
                    });
                }, { rootMargin: '200px' });
                
                ui.contentViewer.querySelectorAll('.math-tex-inline, .math-tex-block').forEach(el => {
                    mathObserver.observe(el);
                });
            }

            updateNavigation(finalPath);
            wrapTables();
            generateTOC();
            initTOCObserver();
            addCopyButtons();
            updateBreadcrumbs(finalPath, data.views);
            
            if (window.mermaid) {
                const mermaidNodes = ui.contentViewer.querySelectorAll('.mermaid');
                if (mermaidNodes.length > 0) {
                    const mermaidObserver = new IntersectionObserver((entries) => {
                        entries.forEach(entry => {
                            if (entry.isIntersecting) {
                                const n = entry.target;
                                if (!n.dataset.processed) {
                                    if (!n.dataset.code) n.dataset.code = n.textContent;
                                    mermaid.run({ nodes: [n], suppressErrors: true });
                                    n.dataset.processed = "true";
                                    mermaidObserver.unobserve(n);
                                }
                            }
                        });
                    }, { rootMargin: '200px' });
                    mermaidNodes.forEach(n => mermaidObserver.observe(n));
                }
            }
            if (window.lucide) lucide.createIcons({
                attrs: { class: 'icon-sm' },
                container: ui.contentViewer
            });
            
            if (hash) {
                setTimeout(() => {
                    const target = document.getElementById(decodeURIComponent(hash));
                    if (target) target.scrollIntoView({ behavior: 'smooth' });
                }, 200);
            }
            
            if (ui.topBar) {
                if (state.currentUser && state.currentUser.role !== 'guest') {
                    ui.topBar.classList.remove('hidden');
                    updateStatusDisplay(data.status);
                    if (ui.visibilityCheckbox) ui.visibilityCheckbox.checked = data.public;
                    
                    const visToggle = ui.topBar.querySelector('.visibility-toggle');
                    const statusDropdown = document.getElementById('status-dropdown');
                    const btnDelete = document.getElementById('btn-delete');
                    
                    if (finalPath === "system/home.md") {
                        if (visToggle) visToggle.classList.add('hidden');
                        if (statusDropdown) statusDropdown.classList.add('hidden');
                        if (btnDelete) btnDelete.classList.add('hidden');
                    } else {
                        if (visToggle) visToggle.classList.remove('hidden');
                        if (statusDropdown) statusDropdown.classList.remove('hidden');
                        if (btnDelete) btnDelete.classList.remove('hidden');
                    }
                } else ui.topBar.classList.add('hidden');
            }
            tree.updateTreeHighlighting(finalPath);
        }, 200); // Sync with fadeOut duration
        currentLoadTimeout = timeout;

    } catch (err) {
        console.error("Load failed:", err);
        const status = parseInt(err.message) || 500;
        renderErrorPage(status, path);
    }
}

export async function loadFolderContent(path, pushState = true) {
    ui.contentViewer.classList.add('fade-out');
    updateURL(path, pushState);
    
    setTimeout(async () => {
        try {
            const res = await fetch(`${API.FOLDER_CONTENT}?path=${encodeURIComponent(path)}`);
            if (res.ok) {
                const data = await res.json();
                const realPath = data.path || path;
                state.currentFilePath = realPath;
                
                // Update URL to the real resolved path if it changed
                if (realPath !== path) {
                    updateURL(realPath, false);
                }
                
                const { renderFolderGrid, updateBreadcrumbs } = await import('./viewer_ui.js');
                
                renderFolderGrid(data);
                updateBreadcrumbs(realPath);
                
                ui.viewModeContainer.classList.remove('hidden');
                ui.topBar.classList.add('hidden');
                if (ui.pageNav) ui.pageNav.classList.add('hidden');
                if (ui.tocSidebar) ui.tocSidebar.classList.add('hidden');
                
                tree.updateTreeHighlighting(realPath);
                ui.contentViewer.style.opacity = '1';
            } else renderErrorPage(res.status, path);
        } catch (err) {
            console.error("Folder load failed:", err);
            renderErrorPage(500, path);
        } finally {
            ui.contentViewer.classList.remove('fade-out');
            ui.contentViewer.classList.add('fade-in');
        }
    }, 300);
}

export function renderWelcomePage() {
    const homePath = state.homePagePath || "system/home.md";
    loadFileContent(homePath, true);
}

let tocObserver = null;
function initTOCObserver() {
    if (tocObserver) tocObserver.disconnect();
    const headers = Array.from(ui.contentViewer.querySelectorAll('h2, h3, h4'));
    if (headers.length === 0) return;
    tocObserver = new IntersectionObserver(entries => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                const id = entry.target.id;
                ui.pageToc.querySelectorAll('a').forEach(a => a.classList.toggle('active', a.getAttribute('href') === `#${id}`));
            }
        });
    }, { rootMargin: '-20% 0px -70% 0px' });
    headers.forEach(h => tocObserver.observe(h));
}

export async function deleteCurrentFile() {
    if (!state.currentFilePath) return;
    const confirmed = await window.confirmAction(
        t('confirm_delete_title') || 'Delete File',
        `${t('confirm_delete_msg') || 'Are you sure you want to delete'} "${state.currentFilePath}"?`,
        t('btn_delete') || 'Delete',
        t('btn_cancel') || 'Cancel'
    );
    if (!confirmed) return;
    const res = await fetch(`/api/files/delete?path=${encodeURIComponent(state.currentFilePath)}`, { method: 'DELETE' });
    if (res.ok) location.href = '/';
    else toast.error('Error');
}
export { resolveRelativePath };
