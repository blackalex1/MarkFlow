import { t } from './i18n.js';
import { state } from './ui.js';
import { tabsExtension, dropdownExtension, inlineMathExtension, blockMathExtension, renderCallout } from './markdown/extensions.js';

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

import { getSlug, parseMarkdown } from './markdown/parser.js';

export { parseMarkdown };

let markedInitialized = false;
export function initMarked() {
    if (markedInitialized) return;
    const renderer = new marked.Renderer();

    renderer.heading = function (arg1, arg2) {
        let text = typeof arg1 === 'object' ? arg1.text : arg1;
        let level = typeof arg1 === 'object' ? arg1.depth : arg2;
        const id = getSlug(text);
        return `<h${level} id="${id}">${text}</h${level}>`;
    };

    renderer.blockquote = function (arg1) {
        let quote = (typeof arg1 === 'object' ? arg1.text : arg1) || '';
        const match = quote.match(/\[!(NOTE|TIP|IMPORTANT|WARNING|CAUTION)\]/i);
        if (match && quote.trim().startsWith(`[!${match[1]}]`)) return renderCallout(match[1], quote);
        return `<blockquote>${marked.parseInline(quote)}</blockquote>`;
    };

    renderer.code = function (arg1, arg2) {
        let code = typeof arg1 === 'object' ? arg1.text : arg1;
        let lang = typeof arg1 === 'object' ? arg1.lang : arg2;
        if (lang === 'mermaid') return `<div class="mermaid">${code}</div>`;
        return `<pre><code class="language-${lang || ''}">${code}</code></pre>`;
    };

    renderer.link = function (arg1, arg2, arg3) {
        let href = typeof arg1 === 'object' ? arg1.href : arg1;
        let title = typeof arg1 === 'object' ? arg1.title : arg2;
        let text = typeof arg1 === 'object' ? arg1.text : arg3;

        const resolved = resolveRelativePath(state.currentFilePath, href);
        return `<a href="${resolved}" title="${title || ''}">${text}</a>`;
    };

    marked.use({
        renderer,
        extensions: [blockMathExtension, inlineMathExtension, tabsExtension, dropdownExtension]
    });
    markedInitialized = true;
}
