/**
 * Centralized Markdown parser state and wrapper.
 */

let slugs = {};
let parseDepth = 0;

/**
 * Resets the slugger state. Should be called before each top-level parse.
 */
export function resetSlugs() {
    slugs = {};
}

/**
 * Returns a unique ID for a given text.
 */
export function getSlug(text) {
    // Generate base ID
    let baseId = text.toLowerCase()
        .replace(/[^\wа-яё]+/gi, '-')
        .replace(/^-|-$/g, '');
        
    // Ensure uniqueness
    let id = baseId;
    let counter = 1;
    while (slugs[id]) {
        id = `${baseId}-${counter}`;
        counter++;
    }
    slugs[id] = true;
    return id;
}

/**
 * Custom parse wrapper that ensures unique IDs for headers.
 */
export function parseMarkdown(content) {
    if (parseDepth === 0) resetSlugs();
    parseDepth++;
    try {
        return window.marked.parse(content);
    } finally {
        parseDepth--;
    }
}
