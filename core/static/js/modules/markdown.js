import { t } from './i18n.js';
import { state } from './ui.js';

function escapeHtml(text) {
    const map = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' };
    return text.replace(/[&<>"']/g, m => map[m]);
}

export function resolveRelativePath(currentPath, href) {
    if (!href || href.startsWith('http') || href.startsWith('/') || href.startsWith('data:') || href.startsWith('blob:') || href.startsWith('mailto:') || href.startsWith('tel:')) return href;
    if (!currentPath) return href;

    const currentDir = currentPath.split('/').filter(p => p);
    currentDir.pop(); // Remove filename
    
    const hrefParts = href.split('/').filter(p => p);

    for (const part of hrefParts) {
        if (part === '..') {
            if (currentDir.length > 0) currentDir.pop();
        } else if (part !== '.') {
            currentDir.push(part);
        }
    }

    return currentDir.join('/');
}

const CALLOUT_MAP = {
    'NOTE': { icon: 'info', class: 'note' },
    'TIP': { icon: 'lightbulb', class: 'tip' },
    'IMPORTANT': { icon: 'alert-circle', class: 'important' },
    'WARNING': { icon: 'alert-triangle', class: 'warning' },
    'CAUTION': { icon: 'zap', class: 'caution' }
};

export function renderCallout(type, content) {
    const cfg = CALLOUT_MAP[type.toUpperCase()] || CALLOUT_MAP['NOTE'];
    const translatedHeader = t(`callout_${type.toLowerCase()}`);
    const cleanContent = content.replace(/\[!(?:NOTE|TIP|IMPORTANT|WARNING|CAUTION)\]/i, '').trim();
    
    return `<div class="callout callout-${cfg.class}">
                <div class="callout-header"><i data-lucide="${cfg.icon}"></i>${translatedHeader}</div>
                <div class="callout-content">${marked.parse(cleanContent)}</div>
            </div>`;
}

export const tabsExtension = {
    name: 'tabs',
    level: 'block',
    tokenizer(src) {
        const rule = /^@tabs[ \t]*\r?\n([\s\S]*?)\r?\n@endtabs(?:\r?\n|$)/;
        const match = rule.exec(src);
        if (match) {
            const token = { type: 'tabs', raw: match[0], tabs: [] };
            const tabRule = /@tab[ \t]+([^\r\n]+)\r?\n([\s\S]*?)(?=\r?\n@tab|$)/g;
            let tabMatch;
            while ((tabMatch = tabRule.exec(match[1])) !== null) {
                token.tabs.push({ name: tabMatch[1].trim(), content: tabMatch[2].trim() });
            }
            return token;
        }
    },
    renderer(token) {
        const id = 'tabs-' + Math.random().toString(36).substr(2, 9);
        let headers = `<div class="tab-headers">`, contents = `<div class="tab-contents">`;
        token.tabs.forEach((tab, index) => {
            const active = index === 0 ? 'active' : '', tabId = `${id}-${index}`;
            headers += `<button class="tab-btn ${active}" data-tab-id="${tabId}">${escapeHtml(tab.name)}</button>`;
            contents += `<div id="${tabId}" class="tab-pane ${active}">${marked.parse(tab.content)}</div>`;
        });
        return `<div class="tabs-container">${headers}</div>${contents}</div></div>`;
    }
};

export const dropdownExtension = {
    name: 'dropdown',
    level: 'block',
    tokenizer(src) {
        const rule = /^@dropdown[ \t]*([^\r\n]*)\r?\n([\s\S]*?)\r?\n@enddropdown(?:\r?\n|$)/;
        const match = rule.exec(src);
        if (match) {
            return {
                type: 'dropdown',
                raw: match[0],
                title: match[1].trim() || 'Details',
                content: match[2].trim()
            };
        }
    },
    renderer(token) {
        const id = 'dropdown-' + Math.random().toString(36).substr(2, 9);
        return `<div id="${id}" class="dropdown-container">
                    <div class="dropdown-header">
                        <span class="dropdown-title">${escapeHtml(token.title)}</span>
                        <i data-lucide="chevron-down" class="dropdown-chevron"></i>
                    </div>
                    <div class="dropdown-content">
                        ${marked.parse(token.content)}
                    </div>
                </div>`;
    }
};

export const inlineMathExtension = {
    name: 'inlineMath',
    level: 'inline',
    start(src) { return src.match(/\$/)?.index; },
    tokenizer(src) {
        const rule = /^\$([^\$\n]+)\$/;
        const match = rule.exec(src);
        if (match) {
            return { type: 'inlineMath', raw: match[0], text: match[1].trim() };
        }
    },
    renderer(token) {
        if (window.katex) {
            try {
                return window.katex.renderToString(token.text, { displayMode: false, throwOnError: false });
            } catch (e) { return token.raw; }
        }
        return token.raw;
    }
};

export const blockMathExtension = {
    name: 'blockMath',
    level: 'inline',
    start(src) { return src.match(/\$\$/)?.index; },
    tokenizer(src) {
        const rule = /^\$\$\r?\n?([\s\S]*?)\r?\n?\$\$/;
        const match = rule.exec(src);
        if (match) {
            return { type: 'blockMath', raw: match[0], text: match[1].trim() };
        }
    },
    renderer(token) {
        if (window.katex) {
            try {
                return `<div class="math-block">${window.katex.renderToString(token.text, { displayMode: true, throwOnError: false })}</div>`;
            } catch (e) { return `<pre>${token.raw}</pre>`; }
        }
        return `<pre>${token.raw}</pre>`;
    }
};

let markedInitialized = false;
export function initMarked() {
    if (markedInitialized) return;
    const renderer = new marked.Renderer();

    renderer.blockquote = function(arg1) {
        let quote = (typeof arg1 === 'object' ? arg1.text : arg1) || '';
        const match = quote.match(/\[!(NOTE|TIP|IMPORTANT|WARNING|CAUTION)\]/i);
        if (match && quote.trim().startsWith(`[!${match[1]}]`)) return renderCallout(match[1], quote);
        return `<blockquote>${marked.parseInline(quote)}</blockquote>`;
    };

    renderer.code = function(arg1, arg2) {
        let code = typeof arg1 === 'object' ? arg1.text : arg1;
        let lang = typeof arg1 === 'object' ? arg1.lang : arg2;
        if (lang === 'mermaid') return `<div class="mermaid">${code}</div>`;
        return `<pre><code class="language-${lang || 'plaintext'}">${escapeHtml(code)}</code></pre>`;
    };

    renderer.listitem = function(arg1, arg2, arg3) {
        let text = typeof arg1 === 'object' ? arg1.text : arg1;
        let task = typeof arg1 === 'object' ? arg1.task : arg2;
        let checked = typeof arg1 === 'object' ? arg1.checked : arg3;
        if (task) {
            return `<li class="task-list-item"><input type="checkbox" ${checked ? 'checked' : ''}><span>${marked.parseInline(text)}</span></li>`;
        }
        return `<li>${marked.parseInline(text)}</li>`;
    };

    renderer.heading = function(arg1, arg2, arg3) {
        let text = typeof arg1 === 'object' ? arg1.text : arg1;
        let level = typeof arg1 === 'object' ? arg1.depth : arg2;
        let raw = typeof arg1 === 'object' ? arg1.raw : arg3;
        const id = (raw || text || '').replace(/<[^>]*>?/gm, '').toLowerCase().trim()
            .replace(/[^a-z0-9а-яё\s-]/g, '').replace(/[\s]+/g, '-').replace(/^-+|-+$/g, '');
        return `<h${level} id="${id}">${marked.parseInline(text)}</h${level}>`;
    };

    renderer.paragraph = function(arg1) {
        let text = (typeof arg1 === 'object' ? arg1.text : arg1) || '';
        const match = text.match(/\[!(NOTE|TIP|IMPORTANT|WARNING|CAUTION)\]/i);
        if (match && text.trim().startsWith(`[!${match[1]}]`)) return renderCallout(match[1], text);
        return `<p>${marked.parseInline(text)}</p>`;
    };
    
    renderer.image = function(arg1, arg2, arg3) {
        let href = typeof arg1 === 'object' ? arg1.href : arg1;
        let title = typeof arg1 === 'object' ? arg1.title : arg2;
        let text = typeof arg1 === 'object' ? arg1.text : arg3;
        
        const resolvedPath = resolveRelativePath(state.currentFilePath, href);
        
        let finalUrl = resolvedPath;
        if (!resolvedPath.startsWith('http') && !resolvedPath.startsWith('blob:') && !resolvedPath.startsWith('data:') && !resolvedPath.startsWith('/api/')) {
            finalUrl = `/api/files/content?path=${encodeURIComponent(resolvedPath)}`;
        }

        const videoExts = ['.mp4', '.webm', '.ogg'];
        if (videoExts.some(ext => href.toLowerCase().endsWith(ext))) {
            return `<div class="video-wrapper">
                        <video controls class="markdown-video">
                            <source src="${finalUrl}" type="video/${href.split('.').pop()}">
                            Your browser does not support the video tag.
                        </video>
                        ${text ? `<div class="video-caption">${escapeHtml(text)}</div>` : ''}
                    </div>`;
        }
        return `<img src="${finalUrl}" alt="${escapeHtml(text || '')}" title="${escapeHtml(title || '')}">`;
    };

    marked.setOptions({ renderer, breaks: true, gfm: true, headerIds: true, mangle: false });
    marked.use({ extensions: [tabsExtension, dropdownExtension, blockMathExtension, inlineMathExtension] });
    markedInitialized = true;
}
