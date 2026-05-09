/**
 * File upload, drag-and-drop, and paste handling for the editor
 * Implements lazy loading: files are uploaded only when 'Save' is clicked.
 */
import { toast } from '../modules/toasts.js';
import { state } from '../modules/ui.js';

// Map to store temporary Blob URLs and their corresponding File objects
export const pendingUploads = new Map();

/**
 * Calculates a relative path from one path to another
 */
function getRelativePath(from, to) {
    const fromParts = from.split('/').filter(p => p);
    const toParts = to.split('/').filter(p => p);
    
    // Remove the filename from 'from'
    fromParts.pop();
    
    let i = 0;
    while (i < fromParts.length && i < toParts.length && fromParts[i] === toParts[i]) {
        i++;
    }
    
    let rel = '';
    for (let j = i; j < fromParts.length; j++) {
        rel += '../';
    }
    
    for (let j = i; j < toParts.length; j++) {
        rel += toParts[j] + (j < toParts.length - 1 ? '/' : '');
    }
    
    return rel || './';
}

export const handleFileUpload = (editor, file) => {
    const isVideo = file.type.startsWith('video/');
    const blobUrl = URL.createObjectURL(file);
    
    // Store for later upload
    pendingUploads.set(blobUrl, file);

    const tag = isVideo 
        ? `<video src="${blobUrl}" controls style="max-width: 100%; border-radius: 8px;"></video>`
        : `![${file.name}](${blobUrl})`;
    
    const cursor = editor.codemirror.getDoc().getCursor();
    editor.codemirror.replaceRange(tag + '\n', cursor);
};

/**
 * Uploads all pending files and replaces their Blob URLs in the content
 */
export const uploadPendingFiles = async (content) => {
    let finalContent = content;
    const urls = Array.from(pendingUploads.keys());
    
    for (const blobUrl of urls) {
        if (finalContent.includes(blobUrl)) {
            const file = pendingUploads.get(blobUrl);
            const formData = new FormData();
            formData.append('file', file);
            if (state.currentFilePath) {
                formData.append('target_path', state.currentFilePath);
            }

            try {
                const response = await fetch('/api/files/upload-image', {
                    method: 'POST',
                    body: formData
                });

                if (!response.ok) throw new Error(await response.text());
                const data = await response.json();
                
                // Calculate relative path for Git portability
                let insertPath = data.path;
                if (state.currentFilePath) {
                    insertPath = getRelativePath(state.currentFilePath, data.path);
                }
                
                // Replace ALL occurrences of this blob URL with the relative path
                finalContent = finalContent.split(blobUrl).join(insertPath);
                
                // Cleanup
                URL.revokeObjectURL(blobUrl);
                pendingUploads.delete(blobUrl);
            } catch (error) {
                console.error('Lazy upload failed for:', blobUrl, error);
                throw new Error(`Failed to upload ${file.name}`);
            }
        } else {
            // File was removed from text, just cleanup
            URL.revokeObjectURL(blobUrl);
            pendingUploads.delete(blobUrl);
        }
    }
    
    return finalContent;
};

export const initDropHandler = (editor) => {
    const wrapper = editor.wrapper;
    
    wrapper.addEventListener('dragover', (e) => {
        e.preventDefault();
        e.stopPropagation();
        wrapper.classList.add('drag-over');
    });

    wrapper.addEventListener('dragleave', (e) => {
        e.preventDefault();
        e.stopPropagation();
        wrapper.classList.remove('drag-over');
    });

    wrapper.addEventListener('drop', async (e) => {
        e.preventDefault();
        e.stopPropagation();
        wrapper.classList.remove('drag-over');

        const files = e.dataTransfer.files;
        if (files.length > 0) {
            for (const file of files) {
                if (file.type.startsWith('image/') || file.type.startsWith('video/')) {
                    handleFileUpload(editor, file);
                }
            }
        }
    });
};

export const initPasteHandler = (editor) => {
    editor.codemirror.on('paste', async (cm, e) => {
        const items = (e.clipboardData || e.originalEvent.clipboardData).items;
        for (const item of items) {
            if (item.type.startsWith('image/') || item.type.startsWith('video/')) {
                const file = item.getAsFile();
                if (file) {
                    e.preventDefault();
                    handleFileUpload(editor, file);
                }
            }
        }
    });
};
