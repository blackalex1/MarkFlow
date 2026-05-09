import { initMarked } from '../modules/markdown.js';

export class MarkFlowEditor {
    constructor(container, options = {}) {
        this.container = container;
        this.options = options;
        this.isFullscreen = false;
        this.isSplit = false;
        this.isPreview = false;
        
        // Initialize project-specific markdown extensions
        initMarked();
        
        this.initUI();
        this.initCodeMirror();
        this.initSyncScroll();
        
        // Render icons for the newly created toolbar
        if (window.lucide) window.lucide.createIcons();
        
        // Alias for compatibility with other modules
        this.codemirror = this.cm;
    }

    initUI() {
        // 1. Create Wrapper
        this.wrapper = document.createElement('div');
        this.wrapper.className = 'mf-editor';
        
        // 2. Create Toolbar
        this.toolbar = document.createElement('div');
        this.toolbar.className = 'mf-editor-toolbar';
        this.createToolbarButtons();
        
        // 3. Create Main Area
        this.main = document.createElement('div');
        this.main.className = 'mf-editor-main';
        
        this.editorPane = document.createElement('div');
        this.editorPane.className = 'mf-editor-code';
        
        this.previewPane = document.createElement('div');
        this.previewPane.className = 'mf-editor-preview';
        
        this.previewContent = document.createElement('div');
        this.previewContent.className = 'mf-editor-preview-content markdown-body';
        this.previewPane.appendChild(this.previewContent);
        
        this.main.appendChild(this.editorPane);
        this.main.appendChild(this.previewPane);
        
        this.wrapper.appendChild(this.toolbar);
        this.wrapper.appendChild(this.main);
        
        // Replace original textarea
        this.container.parentNode.insertBefore(this.wrapper, this.container);
        this.container.style.display = 'none';
    }

    createToolbarButtons() {
        this.buttons = {};
        const buttonsConfig = [
            { id: 'bold', icon: 'bold', action: () => this.toggleFormat('**') },
            { id: 'italic', icon: 'italic', action: () => this.toggleFormat('_') },
            { id: 'heading', icon: 'heading', action: () => this.toggleFormat('# ', true) },
            { type: 'separator' },
            { id: 'quote', icon: 'quote', action: () => this.toggleFormat('> ', true) },
            { id: 'list', icon: 'list', action: () => this.toggleFormat('- ', true) },
            { id: 'link', icon: 'link', action: () => this.insertLink() },
            { type: 'separator' },
            { id: 'preview', icon: 'eye', action: () => this.togglePreview() },
            { id: 'side-by-side', icon: 'columns', action: () => this.toggleSideBySide() },
            { id: 'fullscreen', icon: 'maximize', action: () => this.toggleFullscreen() },
        ];

        buttonsConfig.forEach(btn => {
            if (btn.type === 'separator') {
                const sep = document.createElement('div');
                sep.className = 'mf-editor-toolbar-separator';
                this.toolbar.appendChild(sep);
                return;
            }

            const button = document.createElement('button');
            button.innerHTML = `<i data-lucide="${btn.icon}" class="icon-editor"></i>`;
            button.title = btn.id.charAt(0).toUpperCase() + btn.id.slice(1);
            button.onclick = (e) => {
                e.preventDefault();
                btn.action();
            };
            this.toolbar.appendChild(button);
            
            if (['preview', 'side-by-side', 'fullscreen'].includes(btn.id)) {
                this.buttons[btn.id] = button;
            }
        });
        
        if (window.lucide) window.lucide.createIcons();
    }

    updateToolbarState() {
        if (this.buttons.preview) this.buttons.preview.classList.toggle('active', this.isPreview);
        if (this.buttons['side-by-side']) this.buttons['side-by-side'].classList.toggle('active', this.isSplit);
        if (this.buttons.fullscreen) this.buttons.fullscreen.classList.toggle('active', this.isFullscreen);
    }

    initCodeMirror() {
        // 1. Try to find CM globally
        let CM = window.CodeMirror;
        
        // 2. If not found, try to extract it from EasyMDE
        if (!CM && window.EasyMDE) {
            const tempDiv = document.createElement('textarea');
            tempDiv.style.display = 'none';
            document.body.appendChild(tempDiv);
            
            try {
                const tempMDE = new window.EasyMDE({ 
                    element: tempDiv,
                    autoDownloadFontAwesome: false,
                    spellChecker: false
                });
                CM = tempMDE.codemirror.constructor;
                tempMDE.toTextArea();
            } catch (e) {
                console.error('Failed to extract CodeMirror from EasyMDE:', e);
            } finally {
                document.body.removeChild(tempDiv);
            }
        }
        
        if (!CM) {
            console.error('CodeMirror engine not found. Ensure easymde.min.js is loaded.');
            return;
        }

        this.cm = new CM(this.editorPane, {
            value: this.container.value,
            mode: 'markdown',
            theme: 'material-darker',
            lineWrapping: true,
            viewportMargin: Infinity,
        });

        this.cm.on('change', () => {
            this.container.value = this.cm.getValue();
            if (this.isPreview || this.isSplit) {
                clearTimeout(this.previewTimeout);
                this.previewTimeout = setTimeout(() => this.updatePreview(), 300);
            }
        });
    }

    // --- Actions ---

    toggleFormat(symbol, isPrefix = false) {
        const selection = this.cm.getSelection();
        if (isPrefix) {
            this.cm.replaceSelection(symbol + selection);
        } else {
            this.cm.replaceSelection(symbol + selection + symbol);
        }
        this.cm.focus();
    }

    insertLink() {
        const selection = this.cm.getSelection() || 'link text';
        this.cm.replaceSelection(`[${selection}](https://)`);
        this.cm.focus();
    }

    togglePreview() {
        this.isPreview = !this.isPreview;
        if (this.isPreview) {
            this.isSplit = false;
            this.main.classList.remove('split');
            this.main.classList.add('preview-only');
            this.updatePreview();
        } else {
            this.main.classList.remove('preview-only');
        }
        this.updateToolbarState();
        this.cm.refresh();
    }

    toggleSideBySide() {
        this.isSplit = !this.isSplit;
        if (this.isSplit) {
            this.isPreview = false;
            this.main.classList.remove('preview-only');
            this.main.classList.add('split');
            this.updatePreview();
        } else {
            this.main.classList.remove('split');
        }
        this.updateToolbarState();
        this.cm.refresh();
    }

    toggleFullscreen() {
        this.isFullscreen = !this.isFullscreen;
        
        if (this.isFullscreen) {
            // Save original position
            this.originalParent = this.wrapper.parentNode;
            this.originalNextSibling = this.wrapper.nextSibling;
            
            // Move to body and add global class
            document.body.appendChild(this.wrapper);
            this.wrapper.classList.add('fullscreen');
            document.body.classList.add('editor-fullscreen-active');
            document.body.style.overflow = 'hidden';
        } else {
            // Restore position and remove global class
            if (this.originalParent) {
                this.originalParent.insertBefore(this.wrapper, this.originalNextSibling);
            }
            this.wrapper.classList.remove('fullscreen');
            document.body.classList.remove('editor-fullscreen-active');
            document.body.style.overflow = '';
        }
        
        this.updateToolbarState();
        setTimeout(() => this.cm.refresh(), 10);
    }

    initSyncScroll() {
        this.isSyncScrolling = false;

        // Editor -> Preview
        this.cm.on('scroll', () => {
            if (this.isSyncScrolling || !this.isSplit) return;
            
            this.isSyncScrolling = true;
            const scrollInfo = this.cm.getScrollInfo();
            const percentage = scrollInfo.top / (scrollInfo.height - scrollInfo.clientHeight);
            
            const previewHeight = this.previewPane.scrollHeight - this.previewPane.clientHeight;
            this.previewPane.scrollTop = percentage * previewHeight;
            
            setTimeout(() => { this.isSyncScrolling = false; }, 50);
        });

        // Preview -> Editor
        this.previewPane.onscroll = () => {
            if (this.isSyncScrolling || !this.isSplit) return;
            
            this.isSyncScrolling = true;
            const percentage = this.previewPane.scrollTop / (this.previewPane.scrollHeight - this.previewPane.clientHeight);
            
            const scrollInfo = this.cm.getScrollInfo();
            const editorScrollTop = percentage * (scrollInfo.height - scrollInfo.clientHeight);
            this.cm.scrollTo(null, editorScrollTop);
            
            setTimeout(() => { this.isSyncScrolling = false; }, 50);
        };
    }

    updatePreview() {
        const content = this.cm.getValue();
        if (!window.marked) return;

        // 1. Parse and Sanitize
        let html = window.marked.parse(content);
        if (window.DOMPurify) {
            html = window.DOMPurify.sanitize(html, {
                ADD_ATTR: ['target', 'data-target', 'data-tab-id', 'data-lucide', 'id', 'class'],
                USE_PROFILES: { html: true, mathMl: true, svg: true }
            });
        }
        
        this.previewContent.innerHTML = html;

        // 2. Post-processing
        
        // Lucide Icons
        if (window.lucide) window.lucide.createIcons();
        
        // Math (KaTeX)
        if (window.renderMathInElement) {
            window.renderMathInElement(this.previewContent, {
                delimiters: [{left: '$$', right: '$$', display: true}, {left: '$', right: '$', display: false}],
                throwOnError: false
            });
        }

        // Mermaid Diagrams
        if (window.mermaid) {
            const nodes = this.previewContent.querySelectorAll('.mermaid');
            if (nodes.length > 0) {
                try {
                    window.mermaid.run({ nodes: nodes, suppressErrors: true });
                } catch (e) { console.error('Mermaid error:', e); }
            }
        }

        // Syntax Highlighting
        if (window.hljs) {
            this.previewContent.querySelectorAll('pre code').forEach(el => {
                window.hljs.highlightElement(el);
            });
        }
    }

    value(val) {
        if (val !== undefined) {
            this.cm.setValue(val);
            return;
        }
        return this.cm.getValue();
    }
}
