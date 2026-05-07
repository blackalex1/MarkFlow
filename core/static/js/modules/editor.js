import { ui, state } from './ui.js';
let easyMDE = null;

export function toggleEditMode(editing) {
    if (editing) {
        ui.contentViewer.classList.add('hidden');
        ui.contentEditor.classList.remove('hidden');
        ui.btnEdit.classList.add('hidden');
        ui.btnSave.classList.remove('hidden');
        ui.btnCancel.classList.remove('hidden');
        
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
        } else {
            const wrapper = document.querySelector('.EasyMDEContainer');
            if (wrapper) wrapper.classList.remove('hidden');
        }

        const draft = localStorage.getItem(`draft_${state.currentFilePath}`);
        const serverContent = ui.contentEditor.value;
        
        if (draft && draft !== serverContent) {
            if (confirm("Найдена сохраненная локально копия этого документа. Восстановить черновик?")) {
                easyMDE.value(draft);
            } else {
                easyMDE.value(serverContent);
                localStorage.removeItem(`draft_${state.currentFilePath}`);
            }
        } else {
            easyMDE.value(serverContent);
        }

        setTimeout(() => easyMDE.codemirror.refresh(), 100);
    } else {
        ui.contentViewer.classList.remove('hidden');
        ui.contentEditor.classList.add('hidden');
        ui.btnEdit.classList.remove('hidden');
        ui.btnSave.classList.add('hidden');
        ui.btnCancel.classList.add('hidden');
        if (easyMDE) {
            const wrapper = document.querySelector('.EasyMDEContainer');
            if (wrapper) wrapper.classList.add('hidden');
        }
    }
}

export async function saveFile() {
    let newContent = easyMDE ? easyMDE.value() : ui.contentEditor.value;
    
    // Handle pending DataURL images
    const dataUrlRegex = /!\[([^\]]*)\]\((data:image\/[^;]+;base64,[^)]+)\)/g;
    const matches = [...newContent.matchAll(dataUrlRegex)];
    
    if (matches.length > 0) {
        ui.btnSave.innerText = "Uploading...";
        ui.btnSave.disabled = true;
        
        for (const match of matches) {
            const [fullMatch, alt, dataUrl] = match;
            try {
                const blob = await (await fetch(dataUrl)).blob();
                const file = new File([blob], (alt || "image").replace(/[^a-z0-9]/gi, '_') + '.png', { type: blob.type });
                
                const formData = new FormData();
                formData.append('file', file);
                
                const res = await fetch('/api/files/upload-image', {
                    method: 'POST',
                    body: formData
                });
                if (res.ok) {
                    const data = await res.json();
                    newContent = newContent.replace(dataUrl, data.url);
                }
            } catch (err) { console.error("Image upload failed", err); }
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
        window.dispatchEvent(new CustomEvent('load-file', { detail: { path: state.currentFilePath } }));
    } else {
        alert("Failed to save file");
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
    const reader = new FileReader();
    reader.onload = (e) => {
        const dataUrl = e.target.result;
        const pos = easyMDE.codemirror.getCursor();
        const link = `![${file.name}](${dataUrl})`;
        easyMDE.codemirror.replaceRange(link, pos);
    };
    reader.readAsDataURL(file);
}
