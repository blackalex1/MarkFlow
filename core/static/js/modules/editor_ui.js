import { ui } from './ui.js';

export function initEditorEnhancements(cm, applyFormat, applySlashCommand) {
    cm.on("cursorActivity", () => {
        if (cm.somethingSelected() && cm.getSelection().trim().length > 0) {
            showSelectionToolbar(cm);
        } else ui.selectionToolbar.classList.add('hidden');
    });

    cm.on("inputRead", (cm, change) => {
        if (change.text[0] === "/") {
            const pos = cm.getCursor();
            if (pos.ch === 1 || cm.getLine(pos.line)[pos.ch - 2] === " ") showSlashMenu(cm);
        } else if (!ui.slashMenu.classList.contains('hidden')) {
            const pos = cm.getCursor(), line = cm.getLine(pos.line);
            const slashPos = line.lastIndexOf("/", pos.ch - 1);
            if (slashPos !== -1) filterSlashMenu(line.substring(slashPos + 1, pos.ch).toLowerCase());
            else ui.slashMenu.classList.add('hidden');
        }
    });

    ui.selectionToolbar.querySelectorAll('.toolbar-btn').forEach(btn => {
        btn.onclick = (e) => { e.preventDefault(); applyFormat(cm, btn.dataset.cmd); cm.focus(); };
    });

    ui.slashMenu.querySelectorAll('.slash-item').forEach(item => {
        item.onclick = () => { applySlashCommand(cm, item.dataset.command); ui.slashMenu.classList.add('hidden'); cm.focus(); };
    });

    document.addEventListener('keydown', (e) => {
        if (!ui.slashMenu.classList.contains('hidden')) {
            const items = ui.slashMenu.querySelectorAll('.slash-item'), active = ui.slashMenu.querySelector('.slash-item.active');
            let index = Array.from(items).indexOf(active);
            if (e.key === 'ArrowDown') { e.preventDefault(); if (index < items.length - 1) { active.classList.remove('active'); items[index + 1].classList.add('active'); items[index + 1].scrollIntoView({ block: 'nearest' }); } }
            else if (e.key === 'ArrowUp') { e.preventDefault(); if (index > 0) { active.classList.remove('active'); items[index - 1].classList.add('active'); items[index - 1].scrollIntoView({ block: 'nearest' }); } }
            else if (e.key === 'Enter') { e.preventDefault(); if (active) active.click(); }
            else if (e.key === 'Escape') ui.slashMenu.classList.add('hidden');
        }
    });
}

function showSelectionToolbar(cm) {
    const coords = cm.cursorCoords(true, "window"), toolbar = ui.selectionToolbar;
    toolbar.classList.remove('hidden');
    toolbar.style.top = `${coords.top - toolbar.offsetHeight - 10}px`;
    toolbar.style.left = `${coords.left}px`;
}

function showSlashMenu(cm) {
    const coords = cm.cursorCoords(true, "window"), menu = ui.slashMenu;
    menu.querySelectorAll('.slash-item').forEach(item => item.classList.remove('hidden'));
    menu.querySelectorAll('.slash-item')[0].classList.add('active');
    menu.classList.remove('hidden');
    menu.style.top = `${coords.bottom + 5}px`;
    menu.style.left = `${coords.left}px`;
}

function filterSlashMenu(query) {
    const items = ui.slashMenu.querySelectorAll('.slash-item');
    let firstVisible = null;
    items.forEach(item => {
        const match = item.innerText.toLowerCase().includes(query) || item.dataset.command.toLowerCase().includes(query);
        item.classList.toggle('hidden', !match);
        if (match && !firstVisible) firstVisible = item;
        item.classList.remove('active');
    });
    if (firstVisible) firstVisible.classList.add('active');
    else ui.slashMenu.classList.add('hidden');
}
