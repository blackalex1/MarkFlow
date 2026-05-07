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
                uploadImage: true,
                imageUploadEndpoint: "/api/files/upload-image",
                imageAccept: "image/png, image/jpeg, image/gif, image/webp",
                renderingConfig: {
                    singleLineBreaks: false,
                    codeSyntaxHighlighting: true,
                },
                sideBySideFullscreen: false,
                minHeight: "500px"
            });

            // Handle paste for images
            easyMDE.codemirror.on("paste", (cm, e) => {
                const items = (e.clipboardData || e.originalEvent.clipboardData).items;
                for (let item of items) {
                    if (item.type.indexOf("image") !== -1) {
                        const file = item.getAsFile();
                        uploadAndInsertImage(file);
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
                            uploadAndInsertImage(file);
                        }
                    }
                }
            });
        } else {
            // Ensure it's visible if it was hidden before
            const wrapper = document.querySelector('.EasyMDEContainer');
            if (wrapper) wrapper.classList.remove('hidden');
        }
        easyMDE.value(ui.contentEditor.value);
        // Force refresh to fix layout issues in hidden container
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
    const newContent = easyMDE ? easyMDE.value() : ui.contentEditor.value;
    const res = await fetch(`/api/files/content?path=${encodeURIComponent(state.currentFilePath)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: newContent })
    });
    if (res.ok) {
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

async function uploadAndInsertImage(file) {
    const formData = new FormData();
    formData.append('file', file);

    const pos = easyMDE.codemirror.getCursor();
    easyMDE.codemirror.replaceRange("![Uploading...]()", pos);

    try {
        const res = await fetch('/api/files/upload-image', {
            method: 'POST',
            body: formData
        });
        const data = await res.json();
        if (res.ok) {
            const link = `![${file.name}](${data.url})`;
            const range = {
                from: pos,
                to: { line: pos.line, ch: pos.ch + 15 } // length of "![Uploading...]()"
            };
            easyMDE.codemirror.replaceRange(link, range.from, range.to);
        } else {
            alert("Upload failed: " + data.detail);
        }
    } catch (e) {
        alert("Upload error");
    }
}
