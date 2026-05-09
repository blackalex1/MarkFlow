/**
 * MarkFlow Editor Instance Management
 */
import { MarkFlowEditor } from './markflow-editor.js';
import { handleImageUpload, initPasteHandler } from './image-handler.js';

let instance = null;

export const createEditor = (textarea) => {
    if (instance) {
        destroyEditor();
    }

    // Initialize our custom MarkFlowEditor
    instance = new MarkFlowEditor(textarea, {
        onImageUpload: handleImageUpload
    });
    
    // Paste handler for images
    initPasteHandler(instance);
    
    return instance;
};

export const getEditor = () => instance;

export const destroyEditor = () => {
    if (instance) {
        // Our custom editor doesn't have a built-in destroy yet, 
        // but we can just clear the wrapper if needed.
        const wrapper = instance.wrapper;
        if (wrapper && wrapper.parentNode) {
            wrapper.parentNode.removeChild(wrapper);
        }
        instance = null;
    }
};

export const setEditorValue = (value) => {
    if (instance) instance.value(value);
};

export const getEditorValue = () => {
    return instance ? instance.value() : '';
};
