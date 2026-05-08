import { ui, state } from './ui.js';
import { toast } from './toasts.js';
import * as editor from './editor.js';
import * as tree from './tree.js';
import { t } from './i18n.js';
import { initMarked } from './markdown.js';
import { generateTOC, updateBreadcrumbs, addCopyButtons, updateNavigation } from './viewer_ui.js';

initMarked();

if (window.mermaid) mermaid.initialize({ startOnLoad: false, theme: 'dark' });

export async function loadFileContent(path, pushState = true, hash = null) {
    ui.contentViewer.classList.add('fade-out');
    setTimeout(async () => {
        state.currentFilePath = path;
        if (pushState) {
            const url = new URL(window.location);
            url.searchParams.set('p', path);
            window.history.pushState({ path }, '', url);
        }

        const res = await fetch(`/api/files/content?path=${encodeURIComponent(path)}`);
        if (res.ok) {
            const data = await res.json();
            const cleanHTML = DOMPurify.sanitize(marked.parse(data.content), {
                ADD_ATTR: ['target', 'data-target', 'data-tab-id', 'id', 'class']
            });
            
            ui.contentViewer.innerHTML = cleanHTML;
            ui.contentViewer.classList.remove('fade-out');
            ui.contentViewer.classList.add('fade-in');
            
            if (ui.contentEditor) ui.contentEditor.value = data.content;
            
            ui.contentViewer.querySelectorAll('pre code').forEach(b => {
                if (!b.classList.contains('language-end')) hljs.highlightElement(b);
            });

            if (window.renderMathInElement) {
                renderMathInElement(ui.contentViewer, {
                    delimiters: [{left: '$$', right: '$$', display: true}, {left: '$', right: '$', display: false}],
                    throwOnError: false
                });
            }

            updateNavigation(path);
            generateTOC();
            initTOCObserver();
            addCopyButtons();
            updateBreadcrumbs(path);
            
            if (window.mermaid) {
                try { mermaid.init(undefined, ui.contentViewer.querySelectorAll('.mermaid')); } catch (e) {}
            }
            if (window.lucide) lucide.createIcons();
            
            if (state.currentUser && ['developer', 'maintainer', 'owner'].includes(state.currentUser.role)) {
                ui.contentViewer.querySelectorAll('.task-list-item input[type="checkbox"]').forEach((cb, idx) => {
                    cb.onchange = () => toggleChecklist(idx, cb.checked);
                });
            } else {
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
            
            editor.toggleEditMode(false);
            if (state.currentUser && state.currentUser.role !== 'guest' && state.currentUser.role !== 'reporter') {
                ui.topBar.classList.remove('hidden');
                if (ui.visibilityCheckbox) ui.visibilityCheckbox.checked = data.public;
            } else ui.topBar.classList.add('hidden');
            
            tree.updateTreeHighlighting(path);
        } else renderErrorPage(res.status, path);
    }, 300);
}

function renderErrorPage(status, path) {
    ui.contentViewer.classList.remove('fade-out');
    const config = {
        403: { title: t("error_access_denied"), msg: t("error_access_denied_msg"), icon: "shield-off", actions: `<button class="error-btn error-btn-primary" onclick="document.getElementById('btn-login-trigger').click()"><i data-lucide="log-in"></i> ${t("btn_signin")}</button>` },
        404: { title: t("error_not_found"), msg: t("error_not_found_msg"), icon: "file-question", actions: '' }
    }[status] || { title: t("error_generic"), msg: t("error_generic"), icon: "alert-circle", actions: '' };

    ui.contentViewer.innerHTML = `
        <div class="error-page-container">
            <div class="error-icon-wrapper"><i data-lucide="${config.icon}"></i></div>
            <div class="error-code">${status}</div>
            <div class="error-title">${config.title}</div>
            <div class="error-message">${config.msg}</div>
            <div class="error-actions">${config.actions || `<button class="error-btn error-btn-primary" onclick="location.reload()"><i data-lucide="refresh-cw"></i> ${t("btn_retry")}</button>`}</div>
        </div>`;
    if (window.lucide) lucide.createIcons();
}

async function toggleChecklist(index, isChecked) {
    if (!ui.contentEditor) return;
    let content = ui.contentEditor.value, count = 0;
    const newContent = content.replace(/^(\s*[-*+]\s+\[)([ xX])(\])/gm, (match, p1, p2, p3) => {
        if (count++ === index) return p1 + (isChecked ? 'x' : ' ') + p3;
        return match;
    });
    if (newContent !== content) {
        ui.contentEditor.value = newContent;
        if (editor.easyMDE) editor.easyMDE.value(newContent);
        await editor.saveFile();
    }
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
    toast.show(t("confirm_delete") || "Delete?", "warning", 0, {
        label: t("btn_delete") || "Delete",
        callback: async () => {
            const res = await fetch(`/api/files/delete?path=${encodeURIComponent(state.currentFilePath)}`, { method: 'DELETE' });
            if (res.ok) location.href = '/';
            else toast.error('Error');
        }
    });
}
