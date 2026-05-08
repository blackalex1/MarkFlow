import { t } from './i18n.js';

function escapeHtml(text) {
    const map = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' };
    return text.replace(/[&<>"']/g, m => map[m]);
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
    start(src) { return src.match(/@tabs/)?.index; },
    tokenizer(src) {
        const rule = /^@tabs\s*\n([\s\S]*?)\n@endtabs/;
        const match = rule.exec(src);
        if (match) {
            const token = { type: 'tabs', raw: match[0], tabs: [] };
            const tabRule = /@tab ([^\n]+)\n([\s\S]*?)(?=\n@tab|$)/g;
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

export function initMarked() {
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

    marked.use({ extensions: [tabsExtension] });
    marked.setOptions({ renderer, breaks: true, gfm: true, headerIds: true, mangle: false });
}
