import { t } from '../i18n.js';
import { parseMarkdown } from './parser.js';

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
            contents += `<div id="${tabId}" class="tab-pane ${active}">${parseMarkdown(tab.content)}</div>`;
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
                        ${parseMarkdown(token.content)}
                    </div>
                </div>`;
    }
};

export const inlineMathExtension = {
    name: 'mathInline',
    level: 'inline',
    start(src) { 
        const index = src.indexOf('$');
        if (index === -1) return -1;
        // Optimization: Ensure it's not a escaped \$
        if (index > 0 && src[index - 1] === '\\') return -1;
        return index;
    },
    tokenizer(src) {
        const rule = /^\$((?:[^\$]|\\\$)+)\$/;
        const match = rule.exec(src);
        if (match) {
            return {
                type: 'mathInline',
                raw: match[0],
                text: match[1].trim()
            };
        }
    },
    renderer(token) {
        return `<span class="math-tex-inline" data-math="${escapeHtml(token.text)}"></span>`;
    }
};

export const blockMathExtension = {
    name: 'mathBlock',
    level: 'inline',
    start(src) { return src.indexOf('$$'); },
    tokenizer(src) {
        const rule = /^\$\$([\s\S]*?)\$\$/;
        const match = rule.exec(src);
        if (match) {
            return {
                type: 'mathBlock',
                raw: match[0],
                text: match[1].trim()
            };
        }
    },
    renderer(token) {
        return `<div class="math-tex-block" data-math="${escapeHtml(token.text)}"></div>`;
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
                <div class="callout-content">${parseMarkdown(cleanContent)}</div>
            </div>`;
}
