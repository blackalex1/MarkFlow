/**
 * Editor actions: Save, Cancel, Toggles
 */
import { ui, state } from '../modules/ui.js';
import { toast } from '../modules/toasts.js';
import { getEditorValue, getEditor } from './instance.js';
import { t } from '../modules/i18n.js';
import { updateStatusDisplay } from '../modules/status.js';

const getContainer = () => {
    const editor = getEditor();
    if (!editor) return null;
    return editor.wrapper || (editor.codemirror ? editor.codemirror.getWrapperElement().closest('.EasyMDEContainer') : null);
};

export const saveContent = async () => {
    const path = state.currentFilePath;
    let content = getEditorValue();

    if (!path) {
        toast(t('toast_no_file'), 'error');
        return;
    }

    // Safety check: Don't save empty content for system home to prevent "black screen"
    if ((!content || !content.trim()) && path === 'system/home.md') {
        console.error('Editor returned empty content for home page. Save aborted.');
        toast(t('toast_save_failed'), 'error');
        return;
    }

    try {
        // 1. Upload pending files first
        const { uploadPendingFiles } = await import('./image-handler.js');
        toast(t('toast_uploading'), 'info');
        content = await uploadPendingFiles(content);

        // 2. Save final content
        const v = window.APP_VERSION || Date.now();
        const response = await fetch('/api/files/content?path=' + encodeURIComponent(path), {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ content })
        });

        if (!response.ok) throw new Error(await response.text());

        toast(t('toast_save_success'), 'success');
        
        // Wait a bit and reload content to see changes in viewer
        setTimeout(() => {
            exitEditMode(true, true);
        }, 500);
    } catch (error) {
        console.error('Save failed:', error);
        toast(t('toast_save_failed'), 'error');
    }
};

export const enterEditMode = async () => {
    const path = state.currentFilePath;
    if (!path) return;

    try {
        const res = await fetch(`/api/files/content?path=${encodeURIComponent(path)}`);
        if (!res.ok) throw new Error(t('toast_load_failed'));
        const data = await res.json();

        // Use cache-busting version for dynamic imports
        const v = window.APP_VERSION || Date.now();
        
        // Always create a fresh editor instance for the current file
        const { createEditor } = await import('./instance.js');
        createEditor(ui.contentEditor, path);
        
        if (ui.contentViewer) ui.contentViewer.classList.add('hidden');
        if (ui.contentEditor) ui.contentEditor.classList.remove('hidden');
        if (ui.btnEdit) ui.btnEdit.classList.add('hidden');
        if (ui.btnSave) ui.btnSave.classList.remove('hidden');
        if (ui.btnCancel) ui.btnCancel.classList.remove('hidden');
        
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
        const { setEditorValue } = await import('./instance.js');
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
            updateStatusDisplay(data.status);
        }

    } catch (error) {
        console.error('Edit mode error:', error);
        toast(t('toast_edit_mode_error'), 'error');
    }
};

export const exitEditMode = (reload = false, discardDraft = false) => {
    // Only remove draft if explicitly requested (Save/Cancel)
    const path = state.currentFilePath;
    if (discardDraft && path) {
        localStorage.removeItem(`mf_draft_${path}`);
    }

    if (ui.contentViewer) ui.contentViewer.classList.remove('hidden');
    if (ui.contentEditor) ui.contentEditor.classList.add('hidden');
    if (ui.btnEdit) ui.btnEdit.classList.remove('hidden');
    if (ui.btnSave) ui.btnSave.classList.add('hidden');
    if (ui.btnCancel) ui.btnCancel.classList.add('hidden');
    
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
        window.dispatchEvent(new CustomEvent('load-file', { detail: { path: state.currentFilePath, pushState: false } }));
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
        if (res.ok) toast(t('toast_visibility_updated'), 'success');
    } catch (e) {
        toast(t('toast_visibility_failed'), 'error');
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
        if (res.ok) toast(t('toast_status_updated'), 'success');
    } catch (e) {
        toast(t('toast_status_failed'), 'error');
    }
};
