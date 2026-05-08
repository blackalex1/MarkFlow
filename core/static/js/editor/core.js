import { ui, state } from '../modules/ui.js';
import { toast } from '../modules/toasts.js';
import { initEditorEnhancements } from './ui.js';

export let easyMDE = null;
const pendingImages = new Map();

export function toggleEditMode(editing) {
    if (editing) {
        if (!ui.contentEditor) return;
        ui.viewModeContainer.classList.add('hidden');
        if (ui.pageNav) ui.pageNav.classList.add('hidden');
        ui.contentEditor.classList.remove('hidden');
        ui.btnEdit.classList.add('hidden');
        ui.btnSave.classList.remove('hidden');
        ui.btnCancel.classList.remove('hidden');
        
        if (!easyMDE) {
            easyMDE = new EasyMDE({
                element: ui.contentEditor, spellChecker: false, autosave: { enabled: false },
                status: ["lines", "words", "cursor"], uploadImage: false, minHeight: "500px",
                autoDownloadFontAwesome: false
            });
            easyMDE.codemirror.on("change", () => state.currentFilePath && localStorage.setItem(`draft_${state.currentFilePath}`, easyMDE.value()));
            easyMDE.codemirror.on("paste", (cm, e) => {
                const items = (e.clipboardData || e.originalEvent.clipboardData).items;
                for (let item of items) {
                    if (item.type.includes("image") || item.type.includes("video")) {
                        handleMediaInsert(item.getAsFile());
                    }
                }
            });
            easyMDE.codemirror.on("drop", (cm, e) => {
                const files = e.dataTransfer.files;
                if (files.length > 0) {
                    e.preventDefault();
                    for (let file of files) {
                        if (file.type.includes("image") || file.type.includes("video")) {
                            handleMediaInsert(file);
                        }
                    }
                }
            });
            // Sync layout with side-by-side and fullscreen
            const syncLayout = () => {
                setTimeout(() => {
                    const isSided = easyMDE.isSideBySideActive();
                    const isFS = easyMDE.isFullscreenActive();
                    const active = isSided || isFS;
                    
                    document.body.classList.toggle('editor-side-by-side', active);
                    
                    if (ui.tocSidebar) {
                        // Hide TOC in ALL editing modes (normal or side-by-side)
                        const isEditing = ui.viewModeContainer.classList.contains('hidden');
                        ui.tocSidebar.classList.toggle('hidden', isEditing || active);
                    }
                    
                    if (ui.sidebar) {
                        // Only hide main sidebar in sided or fullscreen mode
                        ui.sidebar.classList.toggle('hidden', active);
                    }
                    
                    easyMDE.codemirror.refresh();
                }, 50);
            };

            const oldSideBySide = easyMDE.toggleSideBySide;
            easyMDE.toggleSideBySide = function() {
                oldSideBySide.call(this);
                syncLayout();
            };
            
            const oldFullScreen = easyMDE.toggleFullScreen;
            easyMDE.toggleFullScreen = function() {
                oldFullScreen.call(this);
                syncLayout();
            };

            // Also check on refresh just in case
            easyMDE.codemirror.on("refresh", syncLayout);

            initEditorEnhancements(easyMDE.codemirror, applyFormat, applySlashCommand);
        } else document.querySelector('.EasyMDEContainer').classList.remove('hidden');

        const draft = localStorage.getItem(`draft_${state.currentFilePath}`), serverContent = ui.contentEditor.value;
        if (draft && draft !== serverContent) {
            toast.show("Найдена копия. Восстановить?", "info", 0, { label: "Да", callback: () => easyMDE.value(draft) });
        } else easyMDE.value(serverContent);
        setTimeout(() => easyMDE.codemirror.refresh(), 100);
    } else {
        ui.viewModeContainer.classList.remove('hidden');
        if (!ui.contentEditor) return;
        ui.contentEditor.classList.add('hidden');
        ui.btnEdit.classList.remove('hidden');
        ui.btnSave.classList.add('hidden');
        ui.btnCancel.classList.add('hidden');
        if (ui.pageNav) ui.pageNav.classList.remove('hidden');
        if (easyMDE) document.querySelector('.EasyMDEContainer').classList.add('hidden');
    }
}

export async function saveFile() {
    let newContent = easyMDE ? easyMDE.value() : ui.contentEditor.value;
    const matches = [...newContent.matchAll(/!\[([^\]]*)\]\((data:[^;]+;base64,[^)]+|blob:[^)]+)\)/g)];
    
    if (matches.length > 0) {
        ui.btnSave.disabled = true;
        try {
            for (const [fullMatch, alt, url] of matches) {
                const file = pendingImages.get(url) || await (await fetch(url)).blob();
                const formData = new FormData();
                formData.append('file', file);
                const res = await fetch('/api/files/upload-image', { method: 'POST', body: formData });
                if (res.ok) {
                    const data = await res.json();
                    newContent = newContent.split(url).join(data.url);
                    if (url.startsWith('blob:')) { URL.revokeObjectURL(url); pendingImages.delete(url); }
                }
            }
        } catch (err) { toast.error("Upload failed"); ui.btnSave.disabled = false; return; }
        ui.btnSave.disabled = false;
    }

    const res = await fetch(`/api/files/content?path=${encodeURIComponent(state.currentFilePath)}`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ content: newContent })
    });
    if (res.ok) {
        if (easyMDE) easyMDE.value(newContent);
        localStorage.removeItem(`draft_${state.currentFilePath}`);
        toast.success("Saved");
        window.dispatchEvent(new CustomEvent('load-file', { detail: { path: state.currentFilePath } }));
    } else toast.error("Error");
}

function handleMediaInsert(file) {
    const blobUrl = URL.createObjectURL(file);
    pendingImages.set(blobUrl, file);
    easyMDE.codemirror.replaceRange(`![${file.name}](${blobUrl})`, easyMDE.codemirror.getCursor());
}

function applyFormat(cm, cmd) {
    const sel = cm.getSelection();
    const formats = { bold: `**${sel}**`, italic: `*${sel}*`, link: `[${sel}](url)`, quote: `> ${sel}` };
    cm.replaceSelection(formats[cmd] || sel);
}

function applySlashCommand(cm, cmd) {
    const pos = cm.getCursor();
    cm.replaceRange("", { line: pos.line, ch: pos.ch - 1 }, pos);
    const snippets = {
        h2: "## ", h3: "### ", table: "\n| C1 | C2 |\n| --- | --- |\n| D1 | D2 |\n",
        code: "\n```javascript\n\n```\n", mermaid: "\n```mermaid\ngraph TD\n    A --> B\n```\n",
        note: "\n> [!NOTE]\n> \n", tip: "\n> [!TIP]\n> \n", warning: "\n> [!WARNING]\n> \n",
        important: "\n> [!IMPORTANT]\n> \n", caution: "\n> [!CAUTION]\n> \n", tabs: "\n@tabs\n@tab T1\nC1\n@endtabs\n"
    };
    cm.replaceRange(snippets[cmd] || "", cm.getCursor());
}

export async function updateVisibility(e) {
    const res = await fetch(`/api/files/visibility?path=${encodeURIComponent(state.currentFilePath)}`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ public: e.target.checked })
    });
    if (!res.ok) { e.target.checked = !e.target.checked; alert("Error"); }
    else window.dispatchEvent(new CustomEvent('tree-update-required'));
}

export async function updateStatus(e) {
    const res = await fetch(`/api/files/status?path=${encodeURIComponent(state.currentFilePath)}`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status: e.target.value })
    });
    if (!res.ok) { toast.error("Error updating status"); }
    else window.dispatchEvent(new CustomEvent('tree-update-required'));
}
