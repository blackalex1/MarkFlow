import { ui, state } from './ui.js';
import * as editor from './editor.js';
import * as tree from './tree.js';

// Custom Tabs Extension for Marked
const tabsExtension = {
    name: 'tabs',
    level: 'block',
    start(src) { return src.match(/@tabs/)?.index; },
    tokenizer(src, tokens) {
        const rule = /^@tabs\n([\s\S]*?)\n@endtabs/;
        const match = rule.exec(src);
        if (match) {
            const token = { type: 'tabs', raw: match[0], tabs: [] };
            const content = match[1];
            const tabRule = /@tab ([^\n]+)\n([\s\S]*?)(?=\n@tab|\n$)/g;
            let tabMatch;
            while ((tabMatch = tabRule.exec(content)) !== null) {
                token.tabs.push({ name: tabMatch[1].trim(), content: tabMatch[2] });
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

// Custom Blockquote for Callouts [!NOTE]
renderer.blockquote = function(arg1) {
    let quote;
    if (typeof arg1 === 'object') {
        quote = arg1.text;
    } else {
        quote = arg1;
    }

    const calloutMap = {
        'NOTE': { icon: 'info', class: 'note' },
        'TIP': { icon: 'lightbulb', class: 'tip' },
        'IMPORTANT': { icon: 'alert-circle', class: 'important' },
        'WARNING': { icon: 'alert-triangle', class: 'warning' },
        'CAUTION': { icon: 'zap', class: 'caution' }
    };

    const match = quote.match(/^<p>\[!(NOTE|TIP|IMPORTANT|WARNING|CAUTION)\]/i);
    if (match) {
        const type = match[1].toUpperCase();
        const cfg = calloutMap[type];
        const content = quote.replace(/^<p>\[!(?:NOTE|TIP|IMPORTANT|WARNING|CAUTION)\]/i, '<p>');
        return `<div class="callout callout-${cfg.class}">
                    <div class="callout-header"><i data-lucide="${cfg.icon}"></i>${type}</div>
                    <div class="callout-content">${content}</div>
                </div>`;
    }
    return `<blockquote>${quote}</blockquote>`;
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
    return `<pre><code class="language-${language}">${code}</code></pre>`;
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

    if (task) {
        return `<li class="task-list-item">
                    <input type="checkbox" ${checked ? 'checked' : ''}>
                    <span>${text}</span>
                </li>`;
    }
    return `<li>${text}</li>`;
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
    return `<h${level} id="${id}">${text}</h${level}>`;
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
        
        const wrapper = document.createElement('div');
        wrapper.className = 'breadcrumb-item';

        const sep = document.createElement('span');
        sep.className = 'breadcrumb-separator';
        sep.textContent = '›';
        ui.breadcrumb.appendChild(sep);

        const span = document.createElement('span');
        span.className = index === parts.length - 1 ? 'breadcrumb-current' : 'breadcrumb-folder';
        
        // Remove .md for display
        let displayName = part.replace('.md', '');
        // Capitalize or handle special cases? Let's keep it simple
        span.textContent = displayName;
        
        ui.breadcrumb.appendChild(span);
    });

    if (window.lucide) lucide.createIcons();
}

export async function deleteCurrentFile() {
    if (!state.currentFilePath) return;
    if (!confirm(`Вы уверены, что хотите удалить "${state.currentFilePath}"? Это действие необратимо.`)) return;

    try {
        const res = await fetch(`/api/files/delete?path=${encodeURIComponent(state.currentFilePath)}`, {
            method: 'DELETE'
        });
        if (res.ok) {
            alert('Файл удален');
            location.href = '/'; // Refresh or go home
        } else {
            const data = await res.json();
            alert('Ошибка при удалении: ' + data.detail);
        }
    } catch (err) {
        console.error(err);
        alert('Ошибка при удалении');
    }
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
        ui.contentEditor.value = data.content;
        
        // Highlight & Utils
        ui.contentViewer.querySelectorAll('pre code').forEach(b => {
            if (!b.classList.contains('language-end') && !b.classList.contains('language-END')) {
                hljs.highlightElement(b);
            }
        });
        generateTOC();
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
            ui.visibilityCheckbox.checked = data.public;
        } else {
            ui.topBar.classList.add('hidden');
        }
        
        tree.updateTreeHighlighting(path);
    } else {
        ui.contentViewer.innerHTML = `<h1>Error</h1><p>Could not load file.</p>`;
    }
}

async function toggleChecklist(index, isChecked) {
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
