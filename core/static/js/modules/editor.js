import { ui, state } from './ui.js';
import { toast } from './toasts.js';

let easyMDE = null;
const pendingImages = new Map();

export function toggleEditMode(editing) {
    if (editing) {
        if (!ui.contentEditor) return;

        ui.viewModeContainer.classList.add('hidden');
        if (ui.pageNav) ui.pageNav.classList.add('hidden');
        ui.contentEditor.classList.remove('hidden');
        if (ui.btnEdit) ui.btnEdit.classList.add('hidden');
        if (ui.btnSave) ui.btnSave.classList.remove('hidden');
        if (ui.btnCancel) ui.btnCancel.classList.remove('hidden');
        
        // Initialize EasyMDE if not exists
        if (!easyMDE) {
            easyMDE = new EasyMDE({
                element: ui.contentEditor,
                spellChecker: false,
                autosave: { enabled: false },
                status: ["lines", "words", "cursor"],
                uploadImage: false, // We handle upload on save
                renderingConfig: {
                    singleLineBreaks: false,
                    codeSyntaxHighlighting: true,
                },
                sideBySideFullscreen: false,
                minHeight: "500px"
            });

            // Auto-save draft to localStorage
            easyMDE.codemirror.on("change", () => {
                if (state.currentFilePath) {
                    localStorage.setItem(`draft_${state.currentFilePath}`, easyMDE.value());
                }
            });

            // Handle paste for images
            easyMDE.codemirror.on("paste", (cm, e) => {
                const items = (e.clipboardData || e.originalEvent.clipboardData).items;
                for (let item of items) {
                    if (item.type.indexOf("image") !== -1) {
                        const file = item.getAsFile();
                        handleImageInsert(file);
                    }
                }
            });

            // Handle drop for images
            easyMDE.codemirror.on("drop", (cm, e) => {
                const files = e.dataTransfer.files;
                if (files.length > 0) {
                    for (let file of files) {
                        if (file.type.startsWith("image/")) {
                            e.preventDefault();
                            handleImageInsert(file);
                        }
                    }
                }
            });

            // Slash Commands & Toolbar
            initEditorEnhancements(easyMDE.codemirror);
        } else {
            const wrapper = document.querySelector('.EasyMDEContainer');
            if (wrapper) wrapper.classList.remove('hidden');
        }

        const draft = localStorage.getItem(`draft_${state.currentFilePath}`);
        const serverContent = ui.contentEditor.value;
        
        if (draft && draft !== serverContent) {
            toast.show("Найдена сохраненная копия документа. Восстановить?", "info", 0, {
                label: "Восстановить",
                callback: () => {
                    easyMDE.value(draft);
                }
            }, 'center');
            // Also add a "Clear" option if needed, but for now info is fine
        } else {
            easyMDE.value(serverContent);
        }

        setTimeout(() => easyMDE.codemirror.refresh(), 100);
    } else {
        if (ui.viewModeContainer) ui.viewModeContainer.classList.remove('hidden');
        if (ui.contentViewer) ui.contentViewer.classList.remove('hidden');
        if (ui.contentEditor) ui.contentEditor.classList.add('hidden');
        if (ui.btnEdit) ui.btnEdit.classList.remove('hidden');
        if (ui.btnSave) ui.btnSave.classList.add('hidden');
        if (ui.btnCancel) ui.btnCancel.classList.add('hidden');
        if (ui.pageNav) ui.pageNav.classList.remove('hidden');
        
        if (easyMDE) {
            const wrapper = document.querySelector('.EasyMDEContainer');
            if (wrapper) wrapper.classList.add('hidden');
        }
    }
}

export async function saveFile() {
    let newContent = easyMDE ? easyMDE.value() : ui.contentEditor.value;
    
    // Handle pending images (DataURLs and Blob URLs)
    const pendingImagesRegex = /!\[([^\]]*)\]\((data:image\/[^;]+;base64,[^)]+|blob:[^)]+)\)/g;
    const matches = [...newContent.matchAll(pendingImagesRegex)];
    
    if (matches.length > 0) {
        ui.btnSave.innerText = "Uploading...";
        ui.btnSave.disabled = true;
        
        const uploadPromises = matches.map(async (match) => {
            const [fullMatch, alt, url] = match;
            try {
                let file;
                if (pendingImages.has(url)) {
                    file = pendingImages.get(url);
                } else if (url.startsWith('data:')) {
                    const response = await fetch(url);
                    const blob = await response.blob();
                    const ext = blob.type.split('/')[1] || 'png';
                    file = new File([blob], (alt || "image").replace(/[^a-z0-9]/gi, '_') + '.' + ext, { type: blob.type });
                } else {
                    return { url, serverUrl: url }; // Already server URL
                }
                
                const formData = new FormData();
                formData.append('file', file);
                
                const res = await fetch('/api/files/upload-image', {
                    method: 'POST',
                    body: formData
                });
                
                if (res.ok) {
                    const data = await res.json();
                    if (url.startsWith('blob:')) {
                        URL.revokeObjectURL(url);
                        pendingImages.delete(url);
                    }
                    return { url, serverUrl: data.url };
                } else {
                    const err = await res.json();
                    throw new Error(err.detail || "Upload failed");
                }
            } catch (err) { 
                console.error("Image upload failed", err);
                throw err;
            }
        });

        try {
            const results = await Promise.all(uploadPromises);
            results.forEach(res => {
                newContent = newContent.split(res.url).join(res.serverUrl);
            });
        } catch (err) {
            toast.error(`Ошибка загрузки изображений: ${err.message}`);
            ui.btnSave.innerText = "Save";
            ui.btnSave.disabled = false;
            return;
        }
        
        ui.btnSave.innerText = "Save";
        ui.btnSave.disabled = false;
    }

    const res = await fetch(`/api/files/content?path=${encodeURIComponent(state.currentFilePath)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: newContent })
    });
    if (res.ok) {
        if (easyMDE) easyMDE.value(newContent);
        localStorage.removeItem(`draft_${state.currentFilePath}`);
        toast.success("Файл успешно сохранен");
        window.dispatchEvent(new CustomEvent('load-file', { detail: { path: state.currentFilePath } }));
    } else {
        toast.error("Ошибка при сохранении файла");
    }
}

export async function updateVisibility(e) {
    const isPublic = e.target.checked;
    const res = await fetch(`/api/files/visibility?path=${encodeURIComponent(state.currentFilePath)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ public: isPublic })
    });
    if (!res.ok) {
        e.target.checked = !isPublic;
        alert("Failed to update visibility");
    } else {
        window.dispatchEvent(new CustomEvent('tree-update-required'));
    }
}

export async function createNewFile() {
    const name = prompt("Enter new file path (e.g. folder/new-page):");
    if (!name) return;
    const res = await fetch(`/api/files/create?path=${encodeURIComponent(name)}`, { method: 'POST' });
    if (res.ok) {
        window.dispatchEvent(new CustomEvent('tree-update-required'));
        const finalPath = name.endsWith('.md') ? name : name + '.md';
        window.dispatchEvent(new CustomEvent('load-file', { detail: { path: finalPath } }));
    }
}

export async function syncGit() {
    ui.btnSyncGit.innerText = "Syncing...";
    ui.btnSyncGit.disabled = true;
    try {
        const res = await fetch('/api/git/sync', { method: 'POST' });
        const data = await res.json();
        alert(data.message || "Sync completed");
        window.dispatchEvent(new CustomEvent('tree-update-required'));
    } catch (e) {
        alert("Sync error");
    } finally {
        ui.btnSyncGit.innerText = "Sync with Git";
        ui.btnSyncGit.disabled = false;
    }
}

async function handleImageInsert(file) {
    // Use Blob URL instead of DataURL for editor cleanliness and performance
    const blobUrl = URL.createObjectURL(file);
    pendingImages.set(blobUrl, file);
    
    const pos = easyMDE.codemirror.getCursor();
    const link = `![${file.name}](${blobUrl})`;
    easyMDE.codemirror.replaceRange(link, pos);
    
    // Refresh preview if active to show the new image
    if (easyMDE.isPreviewActive()) {
        easyMDE.togglePreview();
        easyMDE.togglePreview();
    }
}

function initEditorEnhancements(cm) {
    // Selection Toolbar
    cm.on("cursorActivity", () => {
        if (cm.somethingSelected()) {
            const selection = cm.getSelection();
            if (selection.trim().length > 0) {
                showSelectionToolbar(cm);
            } else {
                ui.selectionToolbar.classList.add('hidden');
            }
        } else {
            ui.selectionToolbar.classList.add('hidden');
        }
    });

    // Slash Menu
    cm.on("inputRead", (cm, change) => {
        if (change.text[0] === "/") {
            const pos = cm.getCursor();
            const line = cm.getLine(pos.line);
            // Show only if / is at the start of a line or after a space
            if (pos.ch === 1 || line[pos.ch - 2] === " ") {
                showSlashMenu(cm);
            }
        } else if (!ui.slashMenu.classList.contains('hidden')) {
            // Live filter
            const pos = cm.getCursor();
            const line = cm.getLine(pos.line);
            const slashPos = line.lastIndexOf("/", pos.ch - 1);
            if (slashPos !== -1) {
                const query = line.substring(slashPos + 1, pos.ch).toLowerCase();
                filterSlashMenu(query);
            } else {
                ui.slashMenu.classList.add('hidden');
            }
        }
    });

    // Handle selection toolbar buttons
    ui.selectionToolbar.querySelectorAll('.toolbar-btn').forEach(btn => {
        btn.onclick = (e) => {
            e.preventDefault();
            const cmd = btn.dataset.cmd;
            applyFormat(cm, cmd);
            cm.focus();
        };
    });

    // Handle slash menu items
    ui.slashMenu.querySelectorAll('.slash-item').forEach(item => {
        item.onclick = () => {
            const cmd = item.dataset.command;
            applySlashCommand(cm, cmd);
            ui.slashMenu.classList.add('hidden');
            cm.focus();
        };
    });

    // Navigation in slash menu
    document.addEventListener('keydown', (e) => {
        if (!ui.slashMenu.classList.contains('hidden')) {
            const items = ui.slashMenu.querySelectorAll('.slash-item');
            const active = ui.slashMenu.querySelector('.slash-item.active');
            let index = Array.from(items).indexOf(active);

            if (e.key === 'ArrowDown') {
                e.preventDefault();
                if (index < items.length - 1) {
                    active.classList.remove('active');
                    items[index + 1].classList.add('active');
                    items[index + 1].scrollIntoView({ block: 'nearest' });
                }
            } else if (e.key === 'ArrowUp') {
                e.preventDefault();
                if (index > 0) {
                    active.classList.remove('active');
                    items[index - 1].classList.add('active');
                    items[index - 1].scrollIntoView({ block: 'nearest' });
                }
            } else if (e.key === 'Enter') {
                e.preventDefault();
                if (active) active.click();
            } else if (e.key === 'Escape') {
                ui.slashMenu.classList.add('hidden');
            }
        }
    });
}

function showSelectionToolbar(cm) {
    const coords = cm.cursorCoords(true, "window");
    const toolbar = ui.selectionToolbar;
    toolbar.classList.remove('hidden');
    
    // Position above the selection
    const top = coords.top - toolbar.offsetHeight - 10;
    const left = coords.left;
    
    toolbar.style.top = `${top}px`;
    toolbar.style.left = `${left}px`;
}

function showSlashMenu(cm) {
    const coords = cm.cursorCoords(true, "window");
    const menu = ui.slashMenu;
    
    // Reset filters
    menu.querySelectorAll('.slash-item').forEach(item => item.classList.remove('hidden'));
    menu.querySelectorAll('.slash-item')[0].classList.add('active');
    
    menu.classList.remove('hidden');
    
    // Position below the cursor
    menu.style.top = `${coords.bottom + 5}px`;
    menu.style.left = `${coords.left}px`;
}

function filterSlashMenu(query) {
    const items = ui.slashMenu.querySelectorAll('.slash-item');
    let firstVisible = null;
    
    items.forEach(item => {
        const text = item.innerText.toLowerCase();
        const cmd = item.dataset.command.toLowerCase();
        if (text.includes(query) || cmd.includes(query)) {
            item.classList.remove('hidden');
            if (!firstVisible) firstVisible = item;
        } else {
            item.classList.add('hidden');
            item.classList.remove('active');
        }
    });

    if (firstVisible) {
        items.forEach(i => i.classList.remove('active'));
        firstVisible.classList.add('active');
    } else {
        ui.slashMenu.classList.add('hidden');
    }
}

function applyFormat(cm, cmd) {
    const selection = cm.getSelection();
    let formatted = "";
    switch(cmd) {
        case 'bold': formatted = `**${selection}**`; break;
        case 'italic': formatted = `*${selection}*`; break;
        case 'link': formatted = `[${selection}](url)`; break;
        case 'quote': formatted = `> ${selection}`; break;
    }
    cm.replaceSelection(formatted);
}

function applySlashCommand(cm, cmd) {
    const pos = cm.getCursor();
    // Delete the slash
    cm.replaceRange("", { line: pos.line, ch: pos.ch - 1 }, pos);
    
    let snippet = "";
    switch(cmd) {
        case 'h2': snippet = "## "; break;
        case 'h3': snippet = "### "; break;
        case 'table': snippet = "\n| Column 1 | Column 2 |\n| --- | --- |\n| Data | Data |\n"; break;
        case 'code': snippet = "\n```javascript\n\n```\n"; break;
        case 'mermaid': snippet = "\n```mermaid\ngraph TD\n    A[Start] --> B{Decision}\n    B -- Yes --> C[Result 1]\n    B -- No --> D[Result 2]\n```\n"; break;
        case 'note': snippet = "\n> [!NOTE]\n> \n"; break;
        case 'tip': snippet = "\n> [!TIP]\n> \n"; break;
        case 'warning': snippet = "\n> [!WARNING]\n> \n"; break;
        case 'important': snippet = "\n> [!IMPORTANT]\n> \n"; break;
        case 'caution': snippet = "\n> [!CAUTION]\n> \n"; break;
        case 'tabs': snippet = "\n@tabs\n@tab Tab 1\nContent\n@tab Tab 2\nContent\n@endtabs\n"; break;
    }
    cm.replaceRange(snippet, cm.getCursor());
    if (cmd === 'h2' || cmd === 'h3' || cmd === 'note') {
        cm.setCursor({ line: cm.getCursor().line, ch: snippet.length });
    }
}
