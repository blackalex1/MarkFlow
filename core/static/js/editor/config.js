/**
 * EasyMDE Configuration for MarkFlow
 */
export const getEditorConfig = (textarea, onImageUpload) => ({
    element: textarea,
    spellChecker: false,
    autosave: {
        enabled: true,
        uniqueId: "markflow-editor",
        delay: 5000,
    },
    status: ["lines", "words", "cursor"],
    renderingConfig: {
        singleLineBreaks: false,
        codeSyntaxHighlighting: true,
    },
    sideBySideFullscreen: false,
    autoDownloadFontAwesome: false,
    toolbar: [
        "bold", "italic", "heading", "|",
        "quote", "unordered-list", "ordered-list", "|",
        "link", 
        {
            name: "image",
            action: (editor) => {
                const input = document.createElement('input');
                input.type = 'file';
                input.accept = 'image/*';
                input.onchange = async (e) => {
                    const file = e.target.files[0];
                    if (file) await onImageUpload(editor, file);
                };
                input.click();
            },
            className: "fa fa-picture-o",
            title: "Upload Image",
        },
        "table", "|",
        "preview", "side-by-side", "fullscreen", "|",
        "guide"
    ],
    shortcuts: {
        "toggleSideBySide": "F9",
        "toggleFullScreen": "F11",
        "togglePreview": "F8",
    },
    promptURLs: true,
});
