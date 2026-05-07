import { ui, state } from './ui.js';
import { toast } from './toasts.js';
import * as editor from './editor.js';
import * as tree from './tree.js';
import { t } from './i18n.js';

function escapeHtml(text) {
    const map = {
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#039;'
    };
    return text.replace(/[&<>"']/g, function(m) { return map[m]; });
}

// Custom Tabs Extension for Marked
const tabsExtension = {
    name: 'tabs',
    level: 'block',
    start(src) { return src.match(/@tabs/)?.index; },
    tokenizer(src, tokens) {
        const rule = /^@tabs\s*\n([\s\S]*?)\n@endtabs/;
        const match = rule.exec(src);
        if (match) {
            const token = { type: 'tabs', raw: match[0], tabs: [] };
            const content = match[1];
            const tabRule = /@tab ([^\n]+)\n([\s\S]*?)(?=\n@tab|$)/g;
            let tabMatch;
            while ((tabMatch = tabRule.exec(content)) !== null) {
                token.tabs.push({ name: tabMatch[1].trim(), content: tabMatch[2].trim() });
            }
            return token;
        }
    },
    renderer(token) {
        const id = 'tabs-' + Math.random().toString(36).substr(2, 9);
        let headers = `<div class="tab-headers">`;
        let contents = `<div class="tab-contents">`;
        token.tabs.forEach((tab, index) => {
            const active = index === 0 ? 'active' : '';
            const tabId = `${id}-${index}`;
            headers += `<button class="tab-btn ${active}" data-tab-id="${tabId}">${tab.name}</button>`;
            contents += `<div id="${tabId}" class="tab-pane ${active}">${marked.parse(tab.content)}</div>`;
        });
        headers += `</div>`;
        contents += `</div>`;
        return `<div class="tabs-container">${headers}${contents}</div>`;
    }
};

marked.use({ extensions: [tabsExtension] });

// Mermaid initialization
if (window.mermaid) {
    mermaid.initialize({ startOnLoad: false, theme: 'dark' });
}

const renderer = new marked.Renderer();

const CALLOUT_MAP = {
    'NOTE': { icon: 'info', class: 'note' },
    'TIP': { icon: 'lightbulb', class: 'tip' },
    'IMPORTANT': { icon: 'alert-circle', class: 'important' },
    'WARNING': { icon: 'alert-triangle', class: 'warning' },
    'CAUTION': { icon: 'zap', class: 'caution' }
};

function renderCallout(type, content) {
    const cfg = CALLOUT_MAP[type.toUpperCase()] || CALLOUT_MAP['NOTE'];
    const translatedHeader = t(`callout_${type.toLowerCase()}`);
    
    // Remove the [!TYPE] marker if it's still there
    const cleanContent = content.replace(/\[!(?:NOTE|TIP|IMPORTANT|WARNING|CAUTION)\]/i, '').trim();
    
    return `<div class="callout callout-${cfg.class}">
                <div class="callout-header"><i data-lucide="${cfg.icon}"></i>${translatedHeader}</div>
                <div class="callout-content">${marked.parse(cleanContent)}</div>
            </div>`;
}

renderer.blockquote = function(arg1) {
    let quote = (typeof arg1 === 'object' ? arg1.text : arg1) || '';
    const match = quote.match(/\[!(NOTE|TIP|IMPORTANT|WARNING|CAUTION)\]/i);
    
    // If the marker is at the beginning of the blockquote
    if (match && quote.trim().startsWith(`[!${match[1]}]`)) {
        return renderCallout(match[1], quote);
    }
    // Ensure content is parsed
    const parsedQuote = marked.parseInline(quote);
    return `<blockquote>${parsedQuote}</blockquote>`;
};

// Custom Code for Mermaid
renderer.code = function(arg1, arg2) {
    let code, lang;
    if (typeof arg1 === 'object') {
        code = arg1.text;
        lang = arg1.lang;
    } else {
        code = arg1;
        lang = arg2;
    }

    if (lang === 'mermaid') {
        return `<div class="mermaid">${code}</div>`;
    }
    
    const language = lang || 'plaintext';
    return `<pre><code class="language-${language}">${escapeHtml(code)}</code></pre>`;
};

// Custom List Item for Checkboxes
renderer.listitem = function(arg1, arg2, arg3) {
    let text, task, checked;
    if (typeof arg1 === 'object') {
        text = arg1.text;
        task = arg1.task;
        checked = arg1.checked;
    } else {
        text = arg1;
        task = arg2;
        checked = arg3;
    }

    const parsedText = marked.parseInline(text);

    if (task) {
        return `<li class="task-list-item">
                    <input type="checkbox" ${checked ? 'checked' : ''}>
                    <span>${parsedText}</span>
                </li>`;
    }
    return `<li>${parsedText}</li>`;
};
renderer.heading = function(arg1, arg2, arg3) {
    let text, level, raw;
    if (typeof arg1 === 'object') {
        text = arg1.text; level = arg1.depth; raw = arg1.raw;
    } else {
        text = arg1; level = arg2; raw = arg3;
    }
    const cleanSource = (raw || text || '').replace(/<[^>]*>?/gm, '');
    const id = cleanSource.toLowerCase().trim()
        .replace(/[^a-z0-9а-яё\s-]/g, '').replace(/[\s]+/g, '-').replace(/^-+|-+$/g, '');
    
    const parsedText = marked.parseInline(text);
    return `<h${level} id="${id}">${parsedText}</h${level}>`;
};

renderer.paragraph = function(arg1) {
    let text = (typeof arg1 === 'object' ? arg1.text : arg1) || '';
    const match = text.match(/\[!(NOTE|TIP|IMPORTANT|WARNING|CAUTION)\]/i);
    
    // Check if it's at the start of the paragraph
    if (match && text.trim().startsWith(`[!${match[1]}]`)) {
        return renderCallout(match[1], text);
    }
    
    // Use the original marked behavior for standard paragraphs
    // If arg1 is an object, we should let marked handle it or use the tokens
    if (typeof arg1 === 'object' && arg1.tokens) {
        return `<p>${marked.parseInline(arg1.text)}</p>`;
    }
    
    return `<p>${marked.parseInline(text)}</p>`;
};

marked.setOptions({ renderer, breaks: true, gfm: true, headerIds: true, mangle: false });

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
    
    // Add a Home icon at the start
    const homeIcon = document.createElement('i');
    homeIcon.setAttribute('data-lucide', 'home');
    homeIcon.className = 'breadcrumb-home-icon';
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
        
        let displayName = part.replace('.md', '');
        span.textContent = displayName;
        
        if (!isLast) {
            span.onclick = () => {
                // If it's a folder, we try to see if there's an index.md 
                // Or just show it as a folder in the tree? 
                // For now, let's just navigate if it's a file path
                if (part.endsWith('.md')) {
                    loadFileContent(thisPath);
                } else {
                    // Try to find if this path exists as a file or just open the folder in tree
                    state.openFolders.add(thisPath);
                    tree.loadFileTree();
                }
            };
        }
        
        ui.breadcrumb.appendChild(span);
    });

    // Add Home click handler
    const homeBtn = ui.breadcrumb.querySelector('.breadcrumb-home-icon');
    if (homeBtn) {
        homeBtn.style.cursor = 'pointer';
        homeBtn.onclick = () => {
            location.href = '/';
        };
    }

    if (window.lucide) lucide.createIcons();
}

export async function deleteCurrentFile() {
    if (!state.currentFilePath) return;
    
    toast.show(`Вы уверены, что хотите удалить "${state.currentFilePath}"?`, "warning", 0, {
        label: "Удалить",
        callback: async () => {
            try {
                const res = await fetch(`/api/files/delete?path=${encodeURIComponent(state.currentFilePath)}`, {
                    method: 'DELETE'
                });
                if (res.ok) {
                    toast.success('Файл удален');
                    location.href = '/';
                } else {
                    const data = await res.json();
                    toast.error('Ошибка при удалении: ' + data.detail);
                }
            } catch (err) {
                console.error(err);
                toast.error('Ошибка при удалении');
            }
        }
    });
}

export function resolveRelativePath(currentPath, relativePath) {
    if (!currentPath || relativePath.startsWith('http') || relativePath.startsWith('#')) return relativePath;
    const parts = currentPath.split('/');
    parts.pop();
    const relParts = relativePath.split('/');
    for (const part of relParts) {
        if (part === '..') parts.pop();
        else if (part === '.' || part === '') continue;
        else parts.push(part);
    }
    return parts.join('/');
}

export async function loadFileContent(path, pushState = true, hash = null) {
    // Add fade-out to current content
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
        
        // Configure DOMPurify to allow IDs and data attributes for tabs
        const cleanHTML = DOMPurify.sanitize(marked.parse(data.content), {
            ADD_ATTR: ['target', 'data-target', 'data-tab-id', 'id', 'class'],
            ADD_TAGS: ['iframe', 'embed']
        });
        
        ui.contentViewer.innerHTML = cleanHTML;
        ui.contentViewer.classList.remove('fade-out');
        ui.contentViewer.classList.add('fade-in');
        
        if (ui.contentEditor) ui.contentEditor.value = data.content;
        
        // Highlight & Utils
        ui.contentViewer.querySelectorAll('pre code').forEach(b => {
            if (!b.classList.contains('language-end') && !b.classList.contains('language-END')) {
                hljs.highlightElement(b);
            }
        });

        // KaTeX rendering
        if (window.renderMathInElement) {
            renderMathInElement(ui.contentViewer, {
                delimiters: [
                    {left: '$$', right: '$$', display: true},
                    {left: '$', right: '$', display: false},
                    {left: '\\(', right: '\\)', display: false},
                    {left: '\\[', right: '\\]', display: true}
                ],
                throwOnError: false
            });
        }

        updateNavigation(path);
        generateTOC();
        initTOCObserver(); // Start tracking visible headers
        addCopyButtons();
        updateBreadcrumbs(path);
        
        // Mermaid rendering
        if (window.mermaid) {
            try {
                mermaid.init(undefined, ui.contentViewer.querySelectorAll('.mermaid'));
            } catch (e) { console.error("Mermaid error:", e); }
        }
        
        if (window.lucide) lucide.createIcons();
        
        // Checklist interactivity
        ui.contentViewer.querySelectorAll('.task-list-item input[type="checkbox"]').forEach((cb, idx) => {
            cb.onchange = () => toggleChecklist(idx, cb.checked);
        });
        
        // Scroll to hash
        if (hash) {
            setTimeout(() => {
                const target = document.getElementById(decodeURIComponent(hash));
                if (target) target.scrollIntoView();
            }, 100);
        }
        
        editor.toggleEditMode(false);
        
        // Admin UI Visibility
        if (state.currentUser && state.currentUser.role !== 'guest' && state.currentUser.role !== 'reporter') {
            ui.topBar.classList.remove('hidden');
            if (ui.visibilityCheckbox) ui.visibilityCheckbox.checked = data.public;
        } else {
            ui.topBar.classList.add('hidden');
        }
        
        tree.updateTreeHighlighting(path);
    } else {
        const status = res ? res.status : 500;
        ui.contentViewer.classList.remove('fade-out');
        renderErrorPage(status, path);
        if (ui.pageNav) ui.pageNav.classList.add('hidden');
    }
}, 300); // Wait for fade-out animation
}

function renderErrorPage(status, path) {
    let title = t("error_generic");
    let message = t("error_generic");
    let icon = "alert-circle";
    let actions = `
        <button class="error-btn error-btn-primary" onclick="location.reload()">
            <i data-lucide="refresh-cw"></i> ${t("btn_retry")}
        </button>
        <button class="error-btn error-btn-outline" onclick="location.href='/'">
            <i data-lucide="home"></i> ${t("btn_home")}
        </button>
    `;

    if (status === 403) {
        title = t("error_access_denied");
        message = t("error_access_denied_msg");
        icon = "shield-off";
        actions = `
            <button class="error-btn error-btn-primary" onclick="document.getElementById('btn-login-trigger').click()">
                <i data-lucide="log-in"></i> ${t("btn_signin")}
            </button>
            <button class="error-btn error-btn-outline" onclick="location.href='/'">
                <i data-lucide="home"></i> ${t("btn_home")}
            </button>
        `;
    } else if (status === 404) {
        title = t("error_not_found");
        message = t("error_not_found_msg");
        icon = "file-question";
    }

    ui.contentViewer.innerHTML = `
        <div class="error-page-container">
            <div class="error-icon-wrapper">
                <i data-lucide="${icon}"></i>
            </div>
            <div class="error-code">${status}</div>
            <div class="error-title">${title}</div>
            <div class="error-message">${message}</div>
            <div class="error-actions">${actions}</div>
        </div>
    `;

    if (window.lucide) lucide.createIcons();
}

function updateNavigation(currentPath) {
    const files = tree.getAllFiles();
    const currentIndex = files.findIndex(f => f.path === currentPath);
    
    if (currentIndex === -1 || files.length <= 1) {
        if (ui.pageNav) ui.pageNav.classList.add('hidden');
        return;
    }
    
    if (!ui.pageNav) return;
    ui.pageNav.classList.remove('hidden');
    
    const prev = files[currentIndex - 1];
    const next = files[currentIndex + 1];
    
    if (prev) {
        ui.navPrev.classList.remove('hidden');
        ui.navPrev.querySelector('.nav-title').textContent = prev.name;
        ui.navPrev.onclick = () => loadFileContent(prev.path);
    } else {
        ui.navPrev.classList.add('hidden');
    }
    
    if (next) {
        ui.navNext.classList.remove('hidden');
        ui.navNext.querySelector('.nav-title').textContent = next.name;
        ui.navNext.onclick = () => loadFileContent(next.path);
    } else {
        ui.navNext.classList.add('hidden');
    }
    
    if (window.lucide) lucide.createIcons();
}

async function toggleChecklist(index, isChecked) {
    if (!ui.contentEditor) return;
    let content = ui.contentEditor.value;
    let count = 0;
    // Regex to find [ ] or [x] at the start of a list item
    const newContent = content.replace(/^(\s*[-*+]\s+\[)([ xX])(\])/gm, (match, p1, p2, p3) => {
        if (count === index) {
            count++;
            return p1 + (isChecked ? 'x' : ' ') + p3;
        }
        count++;
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

    tocObserver = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                const id = entry.target.id;
                ui.pageToc.querySelectorAll('a').forEach(a => {
                    a.classList.toggle('active', a.getAttribute('href') === `#${id}`);
                });
            }
        });
    }, { rootMargin: '-20% 0px -70% 0px' });

    headers.forEach(header => tocObserver.observe(header));
}
