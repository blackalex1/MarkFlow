/**
 * Editor actions: Save, Cancel, Toggles
 */
import { ui, state } from '../modules/ui.js';
import { toast } from '../modules/toasts.js';
import { getEditorValue, getEditor } from './instance.js';
import { loadFileContent } from '../modules/viewer.js';

const getContainer = () => {
    const editor = getEditor();
    if (!editor) return null;
    return editor.wrapper || (editor.codemirror ? editor.codemirror.getWrapperElement().closest('.EasyMDEContainer') : null);
};

export const saveContent = async () => {
    const path = state.currentFilePath;
    const content = getEditorValue();

    if (!path) {
        toast('No file selected', 'error');
        return;
    }

    try {
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
            exitEditMode(true);
        }, 500);
    } catch (error) {
        console.error('Save failed:', error);
        toast('Failed to save file', 'error');
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
            editorInstance = createEditor(ui.contentEditor);
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

        // Update editor value
        const { setEditorValue } = await import(`./instance.js?v=${v}`);
        setEditorValue(data.content);
        
        if (ui.visibilityCheckbox) ui.visibilityCheckbox.checked = data.public;
        if (ui.statusSelect) ui.statusSelect.value = data.status;

    } catch (error) {
        console.error('Edit mode error:', error);
        toast('Failed to enter edit mode', 'error');
    }
};

export const exitEditMode = (reload = false) => {
    ui.contentViewer.classList.remove('hidden');
    ui.contentEditor.classList.add('hidden');
    ui.btnEdit.classList.remove('hidden');
    ui.btnSave.classList.add('hidden');
    ui.btnCancel.classList.add('hidden');
    
    if (ui.tocSidebar) ui.tocSidebar.classList.remove('hidden');
    document.body.classList.remove('is-editing');
    
    const container = getContainer();
    if (container) container.classList.add('hidden');

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
