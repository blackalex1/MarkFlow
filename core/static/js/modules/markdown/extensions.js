import { t } from '../i18n.js';

function escapeHtml(text) {
    const map = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' };
    return text.replace(/[&<>"']/g, m => map[m]);
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
