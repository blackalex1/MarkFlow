import { ui, state } from './ui.js';
import * as viewer from './viewer.js';

export function initGlobalHandlers() {
    window.onclick = (e) => {
        // 1. Tabs
        const btn = e.target.closest('.tab-btn');
        if (btn) {
            const paneId = btn.dataset.target || btn.dataset.tabId;
            const wrapper = btn.closest('.custom-tabs-wrapper') || btn.closest('.tabs-container');
            if (wrapper && paneId) {
                e.preventDefault();
                wrapper.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
                wrapper.querySelectorAll('.tab-pane').forEach(p => p.classList.remove('active'));
                btn.classList.add('active');
                const target = document.getElementById(paneId) || wrapper.querySelector(`[id="${paneId}"]`);
                if (target) {
                    target.classList.add('active');
                    if (typeof hljs !== 'undefined') {
                        target.querySelectorAll('pre code').forEach(b => {
                            if (!b.dataset.highlighted && !b.classList.contains('language-end') && !b.classList.contains('language-END')) {
                                hljs.highlightElement(b);
                                b.dataset.highlighted = "true";
                            }
                        });
                    }
                }
                return;
            }
        }

        // 2. Links
        const link = e.target.closest('a');
        if (link) {
            const href = link.getAttribute('href');
            if (href && !href.startsWith('http') && !href.startsWith('mailto')) {
                if (href.startsWith('#')) {
                    e.preventDefault();
                    const target = document.getElementById(decodeURIComponent(href.substring(1)));
                    if (target) target.scrollIntoView({ behavior: 'smooth' });
                    return;
                }
                if (href.includes('.md')) {
                    e.preventDefault();
                    const [relPath, encodedHash] = href.split('#');
                    const absolutePath = viewer.resolveRelativePath(state.currentFilePath, relPath);
                    viewer.loadFileContent(absolutePath, true, encodedHash);
                }
            }
        }
    };

    // Handle browser back/forward
    window.onpopstate = (e) => {
        if (e.state && e.state.path) {
            viewer.loadFileContent(e.state.path, false);
        }
    };
}
