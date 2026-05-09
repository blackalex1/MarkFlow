/**
 * Slash Menu for MarkFlow Editor
 * Provides quick insertion of complex markdown blocks
 */

const COMMANDS = [
    {
        id: 'note',
        icon: 'info',
        label: 'Note',
        description: 'Blue information block',
        template: '\n\n> [!NOTE]\n> Title\n> Content here'
    },
    {
        id: 'tip',
        icon: 'lightbulb',
        label: 'Tip',
        description: 'Green tip/success block',
        template: '\n\n> [!TIP]\n> Tip title\n> Helpful hint here'
    },
    {
        id: 'important',
        icon: 'alert-circle',
        label: 'Important',
        description: 'Indigo importance block',
        template: '\n\n> [!IMPORTANT]\n> Important title\n> Don\'t forget this'
    },
    {
        id: 'warning',
        icon: 'alert-triangle',
        label: 'Warning',
        description: 'Yellow warning block',
        template: '\n\n> [!WARNING]\n> Warning title\n> Watch out!'
    },
    {
        id: 'caution',
        icon: 'zap',
        label: 'Caution',
        description: 'Red danger block',
        template: '\n\n> [!CAUTION]\n> Caution title\n> Critical info'
    },
    {
        id: 'tabs',
        icon: 'layout',
        label: 'Tabs Container',
        description: 'Multi-tab content block',
        template: '\n\n@tabs\n@tab Tab 1\nContent 1\n@tab Tab 2\nContent 2\n@endtabs'
    },
    {
        id: 'dropdown',
        icon: 'chevron-down',
        label: 'Dropdown / Spoiler',
        description: 'Collapsible content block',
        template: '\n\n@dropdown Title\nContent here\n@enddropdown'
    },
    {
        id: 'code',
        icon: 'code',
        label: 'Code Block',
        description: 'Fenced code block',
        template: '\n\n```python\n# code here\n```'
    }
];

export class SlashMenu {
    constructor(editor) {
        this.editor = editor;
        this.cm = editor.cm;
        this.active = false;
        this.selectedIndex = 0;
        this.filteredCommands = [...COMMANDS];
        
        this.initUI();
        this.bindEvents();
    }

    initUI() {
        this.menu = document.createElement('div');
        this.menu.className = 'mf-slash-menu hidden';
        document.body.appendChild(this.menu);
    }

    bindEvents() {
        this.cm.on('keydown', (cm, e) => this.handleKeyDown(e));
        this.cm.on('keyup', (cm, e) => this.handleKeyUp(e));
        this.cm.on('blur', () => this.hide());
        
        // Hide on click outside
        document.addEventListener('click', (e) => {
            if (this.active && !this.menu.contains(e.target)) {
                this.hide();
            }
        });
    }

    handleKeyDown(e) {
        if (!this.active) return;

        if (e.key === 'ArrowDown') {
            e.preventDefault();
            this.selectedIndex = (this.selectedIndex + 1) % this.filteredCommands.length;
            this.render();
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            this.selectedIndex = (this.selectedIndex - 1 + this.filteredCommands.length) % this.filteredCommands.length;
            this.render();
        } else if (e.key === 'Enter' || e.key === 'Tab') {
            e.preventDefault();
            this.insertSelected();
        } else if (e.key === 'Escape') {
            e.preventDefault();
            this.hide();
        }
    }

    handleKeyUp(e) {
        const cursor = this.cm.getCursor();
        const line = this.cm.getLine(cursor.line);
        const beforeCursor = line.slice(0, cursor.ch);
        
        // Match / at start of line or after space
        const match = beforeCursor.match(/(?:^|\s)\/(\w*)$/);
        
        if (match) {
            const query = match[1].toLowerCase();
            this.filteredCommands = COMMANDS.filter(cmd => 
                cmd.label.toLowerCase().includes(query) || 
                cmd.id.toLowerCase().includes(query)
            );

            if (this.filteredCommands.length > 0) {
                this.show();
                this.render();
            } else {
                this.hide();
            }
        } else {
            this.hide();
        }
    }

    show() {
        if (this.active) return;
        this.active = true;
        this.menu.classList.remove('hidden');
        this.updatePosition();
    }

    hide() {
        if (!this.active) return;
        this.active = false;
        this.menu.classList.add('hidden');
        this.selectedIndex = 0;
    }

    updatePosition() {
        const cursorCoords = this.cm.cursorCoords(true, 'window');
        this.menu.style.left = `${cursorCoords.left}px`;
        this.menu.style.top = `${cursorCoords.bottom + 5}px`;
    }

    render() {
        this.menu.innerHTML = '';
        this.filteredCommands.forEach((cmd, index) => {
            const item = document.createElement('div');
            item.className = `mf-slash-item ${index === this.selectedIndex ? 'active' : ''}`;
            item.innerHTML = `
                <div class="mf-slash-icon">
                    <i data-lucide="${cmd.icon}"></i>
                </div>
                <div class="mf-slash-info">
                    <div class="mf-slash-label">${cmd.label}</div>
                    <div class="mf-slash-desc">${cmd.description}</div>
                </div>
            `;
            item.onmousedown = (e) => {
                e.preventDefault();
                e.stopPropagation();
                this.selectedIndex = index;
                this.insertSelected();
            };
            this.menu.appendChild(item);
        });

        if (window.lucide) window.lucide.createIcons();

        // Ensure selected item is visible
        const activeItem = this.menu.querySelector('.mf-slash-item.active');
        if (activeItem) {
            activeItem.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
        }
    }

    insertSelected() {
        const cmd = this.filteredCommands[this.selectedIndex];
        if (!cmd) return;

        const cursor = this.cm.getCursor();
        const line = this.cm.getLine(cursor.line);
        const beforeCursor = line.slice(0, cursor.ch);
        
        // Find the / position to replace it
        const match = beforeCursor.match(/(?:^|\s)\/\w*$/);
        if (match) {
            const startCh = cursor.ch - match[0].trim().length - (match[0].startsWith(' ') ? 0 : 0);
            // If it starts with space, we keep the space? No, match[0] includes the space if any.
            // Let's be precise.
            const slashPos = beforeCursor.lastIndexOf('/');
            
            this.cm.replaceRange(cmd.template, { line: cursor.line, ch: slashPos }, cursor);
        }

        this.hide();
        this.cm.focus();
    }
}
