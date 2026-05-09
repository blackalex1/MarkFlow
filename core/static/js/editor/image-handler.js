/**
 * Image upload and paste handling for the editor
 */
import { toast } from '../modules/toasts.js';

export const handleImageUpload = async (editor, file) => {
    const formData = new FormData();
    formData.append('file', file);

    const placeholder = `![Uploading ${file.name}...]()`;
    const cursor = editor.codemirror.getDoc().getCursor();
    editor.codemirror.replaceRange(placeholder, cursor);

    try {
        const response = await fetch('/api/files/upload-image', {
            method: 'POST',
            body: formData
        });

        if (!response.ok) throw new Error(await response.text());

        const data = await response.json();
        const markdownImage = `![${file.name}](${data.path})`;
        
        // Find the placeholder and replace it
        const content = editor.value();
        const newContent = content.replace(placeholder, markdownImage);
        editor.value(newContent);
        
        toast('Image uploaded successfully', 'success');
    } catch (error) {
        console.error('Image upload failed:', error);
        toast('Failed to upload image', 'error');
        // Remove placeholder
        const content = editor.value();
        editor.value(content.replace(placeholder, ''));
    }
};

export const initPasteHandler = (editor) => {
    editor.codemirror.on('paste', async (cm, e) => {
        const items = (e.clipboardData || e.originalEvent.clipboardData).items;
        for (const item of items) {
            if (item.type.indexOf('image') !== -1) {
                const file = item.getAsFile();
                if (file) {
                    e.preventDefault();
                    await handleImageUpload(editor, file);
                }
            }
        }
    });
};
