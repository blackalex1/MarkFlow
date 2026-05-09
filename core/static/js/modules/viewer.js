import { ui, state } from './ui.js';
import { toast } from './toasts.js';
import * as tree from './tree.js';
import { t } from './i18n.js';
import { initMarked } from './markdown.js';
import { generateTOC, updateBreadcrumbs, addCopyButtons, updateNavigation } from './viewer_ui.js';
import { API } from './api.js';

initMarked();

if (window.mermaid) {
    mermaid.initialize({ 
        startOnLoad: false, 
        theme: 'dark',
        securityLevel: 'antiscript',
        fontFamily: 'inherit'
    });
}

export async function loadFileContent(path, pushState = true, hash = null) {
    // Ensure we exit edit mode when switching files
    const editor = await import('../editor/index.js');
    if (editor && editor.actions) editor.actions.exitEditMode(false);

    ui.contentViewer.classList.add('fade-out');
    setTimeout(async () => {
        state.currentFilePath = path;
        if (pushState) {
            const url = new URL(window.location);
            url.searchParams.set('p', path);
            window.history.pushState({ path }, '', url);
        }

        const res = await fetch(`${API.FILE_CONTENT}?path=${encodeURIComponent(path)}`);
        if (res.ok) {
            const data = await res.json();
            if (data.is_folder) {
                return loadFolderContent(path);
            }
            const cleanHTML = DOMPurify.sanitize(marked.parse(data.content), {
                ADD_ATTR: ['target', 'data-target', 'data-tab-id', 'data-lucide', 'id', 'class', 'data-code'],
                USE_PROFILES: { html: true, mathMl: true, svg: true },
                RETURN_TRUSTED_TYPE: true // Support for Trusted Types
            });
            
            if (ui.contentViewer) {
                ui.contentViewer.innerHTML = cleanHTML;
                ui.contentViewer.classList.remove('fade-out');
                ui.contentViewer.classList.add('fade-in');
                ui.contentViewer.querySelectorAll('pre code').forEach(b => {
                    if (!b.classList.contains('language-end')) hljs.highlightElement(b);
                });
            }

            if (window.renderMathInElement && ui.contentViewer) {
                renderMathInElement(ui.contentViewer, {
                    delimiters: [
                        {left: '$$', right: '$$', display: true}, 
                        {left: '$', right: '$', display: false}
                    ],
                    throwOnError: false,
                    strict: false,
                    trust: false
                });
            }

            updateNavigation(path);
            generateTOC();
            initTOCObserver();
            addCopyButtons();
            updateBreadcrumbs(path);
            
            if (window.mermaid && ui.contentViewer) {
                // Ensure elements are truly visible and have dimensions
                setTimeout(() => {
                    try {
                        const nodes = ui.contentViewer.querySelectorAll('.mermaid');
                        if (nodes.length > 0) {
                            nodes.forEach(n => {
                                // Store original code for re-renders in tabs/dropdowns
                                if (!n.dataset.code) n.dataset.code = n.textContent;
                            });
                            // Verify viewer width to avoid "translate(undefined, NaN)" errors
                            const rect = ui.contentViewer.getBoundingClientRect();
                            if (rect.width > 0) {
                                mermaid.run({
                                    nodes: nodes,
                                    suppressErrors: true
                                });
                            }
                        }
                    } catch (e) {
                        console.error('Mermaid render error:', e);
                    }
                }, 400); // Stable delay for complex SVG layouts
            }
            if (window.lucide) lucide.createIcons();
            
            if (ui.contentViewer) {
                ui.contentViewer.querySelectorAll('.task-list-item input[type="checkbox"]').forEach(cb => {
                    cb.disabled = true;
                });
            }
            
            if (hash) {
                setTimeout(() => {
                    const target = document.getElementById(decodeURIComponent(hash));
                    if (target) target.scrollIntoView();
                }, 100);
            }
            
            if (ui.topBar) {
                if (state.currentUser && state.currentUser.role !== 'guest' && state.currentUser.role !== 'reporter') {
                    ui.topBar.classList.remove('hidden');
                } else ui.topBar.classList.add('hidden');
            }
            
            tree.updateTreeHighlighting(path);
        } else renderErrorPage(res.status, path);
    }, 300);
}

export async function loadFolderContent(path) {
    ui.contentViewer.classList.add('fade-out');
    
    setTimeout(async () => {
        const res = await fetch(`${API.FOLDER_CONTENT}?path=${encodeURIComponent(path)}`);
        if (res.ok) {
            const data = await res.json();
            const { renderFolderGrid, updateBreadcrumbs } = await import('./viewer_ui.js');
            
            renderFolderGrid(data);
            updateBreadcrumbs(path);
            
            ui.contentViewer.classList.remove('fade-out');
            ui.contentViewer.classList.add('fade-in');
            
            ui.viewModeContainer.classList.remove('hidden');
            ui.topBar.classList.add('hidden');
            if (ui.pageNav) ui.pageNav.classList.add('hidden');
            if (ui.tocSidebar) ui.tocSidebar.classList.add('hidden');
            
            tree.updateTreeHighlighting(path);
        } else renderErrorPage(res.status, path);
    }, 300);
}

function renderErrorPage(status, path) {
    ui.contentViewer.classList.remove('fade-out');
    const config = {
        403: { 
            title: t("error_access_denied"), 
            msg: t("error_access_denied_msg"), 
            icon: "shield-off", 
            actions: `<button id="error-btn-login" class="error-btn error-btn-primary"><i data-lucide="log-in"></i> ${t("btn_signin")}</button>` 
        },
        404: { 
            title: t("error_not_found"), 
            msg: t("error_not_found_msg"), 
            icon: "file-question", 
            actions: '' 
        }
    }[status] || { title: t("error_generic"), msg: t("error_generic"), icon: "alert-circle", actions: '' };

    const retryBtn = `<button id="error-btn-retry" class="error-btn error-btn-primary"><i data-lucide="refresh-cw"></i> ${t("btn_retry")}</button>`;
    
    ui.contentViewer.innerHTML = `
        <div class="error-page-container">
            <div class="error-icon-wrapper"><i data-lucide="${config.icon}"></i></div>
            <div class="error-code">${status}</div>
            <div class="error-title">${config.title}</div>
            <div class="error-message">${config.msg}</div>
            <div class="error-actions">${config.actions || retryBtn}</div>
        </div>`;
    
    // Add Event Listeners (CSP Friendly)
    const btnLogin = document.getElementById('error-btn-login');
    const btnRetry = document.getElementById('error-btn-retry');
    
    if (btnLogin) {
        btnLogin.onclick = () => {
            const loginTrigger = document.getElementById('btn-login-trigger');
            if (loginTrigger) loginTrigger.click();
        };
    }
    if (btnRetry) {
        btnRetry.onclick = () => location.reload();
    }

    if (window.lucide) lucide.createIcons();
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
