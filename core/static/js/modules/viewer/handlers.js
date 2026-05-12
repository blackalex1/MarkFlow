export function initMarkdownComponentHandlers() {
    window.addEventListener('click', (e) => {
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
                    if (window.mermaid) {
                        setTimeout(() => {
                            try {
                                const nodes = target.querySelectorAll('.mermaid');
                                nodes.forEach(n => {
                                    if (n.dataset.code) {
                                        n.textContent = n.dataset.code;
                                        n.removeAttribute('data-processed');
                                    }
                                });
                                mermaid.run({
                                    nodes: nodes,
                                    suppressErrors: false
                                });
                            } catch (e) {
                                console.error('Mermaid tab render error:', e);
                            }
                        }, 300);
                    }
                }
                return;
            }
        }
        
        // 2. Dropdowns (Accordions)
        const ddHeader = e.target.closest('.dropdown-header');
        if (ddHeader) {
            const container = ddHeader.closest('.dropdown-container');
            if (container) {
                container.classList.toggle('expanded');
                if (container.classList.contains('expanded')) {
                    if (typeof hljs !== 'undefined') {
                        container.querySelectorAll('pre code').forEach(b => {
                            if (!b.dataset.highlighted && !b.classList.contains('language-end')) {
                                hljs.highlightElement(b);
                                b.dataset.highlighted = "true";
                            }
                        });
                    }
                    if (window.mermaid) {
                        setTimeout(() => {
                            try {
                                const nodes = container.querySelectorAll('.mermaid');
                                nodes.forEach(n => {
                                    if (n.dataset.code) {
                                        n.textContent = n.dataset.code;
                                        n.removeAttribute('data-processed');
                                    }
                                });
                                mermaid.run({
                                    nodes: nodes,
                                    suppressErrors: false
                                });
                            } catch (e) {
                                console.error('Mermaid dropdown render error:', e);
                            }
                        }, 300);
                    }
                }
            }
        }
    });
}
