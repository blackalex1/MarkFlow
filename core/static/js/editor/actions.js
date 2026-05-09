/**
 * Editor actions: Save, Cancel, Toggles
 */
import { ui, state } from '../modules/ui.js';
import { toast } from '../modules/toasts.js';
import { getEditorValue, getEditor } from './instance.js';
import { loadFileContent } from '../modules/viewer.js';
import { t } from '../modules/i18n.js';

const getContainer = () => {
    const editor = getEditor();
    if (!editor) return null;
    return editor.wrapper || (editor.codemirror ? editor.codemirror.getWrapperElement().closest('.EasyMDEContainer') : null);
};

export const saveContent = async () => {
    const path = state.currentFilePath;
    let content = getEditorValue();

    if (!path) {
        toast('No file selected', 'error');
        return;
    }

    try {
        // 1. Upload pending files first
        const { uploadPendingFiles } = await import(`./image-handler.js?v=${window.APP_VERSION || Date.now()}`);
        toast('Uploading attachments...', 'info');
        content = await uploadPendingFiles(content);

        // 2. Save final content
        const v = window.APP_VERSION || Date.now();
        const response = await fetch('/api/files/content?path=' + encodeURIComponent(path), {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ content })
        });

        if (!response.ok) throw new Error(await response.text());

        toast('File saved successfully', 'success');
        
        // Wait a bit and reload content to see changes in viewer
        setTimeout(() => {
            exitEditMode(true, true);
        }, 500);
    } catch (error) {
        console.error('Save failed:', error);
        toast(error.message || 'Failed to save file', 'error');
    }
};

export const enterEditMode = async () => {
    const path = state.currentFilePath;
    if (!path) return;

    try {
        const res = await fetch(`/api/files/content?path=${encodeURIComponent(path)}`);
        if (!res.ok) throw new Error('Failed to load content');
        const data = await res.json();

        // Use cache-busting version for dynamic imports
        const v = window.APP_VERSION || Date.now();
        
        let editorInstance = getEditor();
        if (!editorInstance) {
            const { createEditor } = await import(`./instance.js?v=${v}`);
            editorInstance = createEditor(ui.contentEditor, path);
        }
        
        ui.contentViewer.classList.add('hidden');
        ui.contentEditor.classList.remove('hidden');
        ui.btnEdit.classList.add('hidden');
        ui.btnSave.classList.remove('hidden');
        ui.btnCancel.classList.remove('hidden');
        
        if (ui.tocSidebar) ui.tocSidebar.classList.add('hidden');
        document.body.classList.add('is-editing');

        const container = getContainer();
        if (container) container.classList.remove('hidden');

        // 1. Draft Check (BEFORE setting editor value to avoid overwrite)
        const draft = localStorage.getItem(`mf_draft_${path}`);
        let hasDraft = false;
        if (draft && draft !== data.content) {
            hasDraft = true;
        }

        // 2. Update editor value
        const { setEditorValue } = await import(`./instance.js?v=${v}`);
        setEditorValue(data.content);
        
        // 3. Show notification if draft exists
        if (hasDraft) {
            toast(t('toast_draft_found'), 'warning', 0, {
                label: t('btn_restore'),
                callback: () => {
                    setEditorValue(draft);
                    toast(t('toast_draft_restored'), 'success');
                }
            });
        }
        
        if (ui.visibilityCheckbox) ui.visibilityCheckbox.checked = data.public;
        if (ui.statusDropdown) {
            const statusText = document.getElementById('current-status-text');
            const item = ui.statusDropdown.querySelector(`.dropdown-item[data-value="${data.status}"]`);
            if (item && statusText) {
                statusText.textContent = item.textContent;
                statusText.setAttribute('data-t', item.getAttribute('data-t'));
            }
        }

    } catch (error) {
        console.error('Edit mode error:', error);
        toast('Failed to enter edit mode', 'error');
    }
};

export const exitEditMode = (reload = false, discardDraft = false) => {
    // Only remove draft if explicitly requested (Save/Cancel)
    const path = state.currentFilePath;
    if (discardDraft && path) {
        localStorage.removeItem(`mf_draft_${path}`);
    }

    ui.contentViewer.classList.remove('hidden');
    ui.contentEditor.classList.add('hidden');
    ui.btnEdit.classList.remove('hidden');
    ui.btnSave.classList.add('hidden');
    ui.btnCancel.classList.add('hidden');
    
    if (ui.tocSidebar) ui.tocSidebar.classList.remove('hidden');
    document.body.classList.remove('is-editing');
    
    const container = getContainer();
    if (container) {
        container.classList.add('hidden');
        container.classList.remove('fullscreen', 'split');
        
        // Restore body scroll if it was locked in fullscreen
        document.body.style.overflow = '';
    }

    if (reload && state.currentFilePath) {
        loadFileContent(state.currentFilePath, false);
    }
};

export const updateVisibility = async (public_flag) => {
    const path = state.currentFilePath;
    try {
        const res = await fetch(`/api/files/visibility?path=${encodeURIComponent(path)}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ public: public_flag })
        });
        if (res.ok) toast('Visibility updated', 'success');
    } catch (e) {
        toast('Failed to update visibility', 'error');
    }
};

export const updateStatus = async (status) => {
    const path = state.currentFilePath;
    try {
        const res = await fetch(`/api/files/status?path=${encodeURIComponent(path)}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ status })
        });
        if (res.ok) toast('Status updated', 'success');
    } catch (e) {
        toast('Failed to update status', 'error');
    }
};
