/**
 * Security utilities for MarkFlow
 */

/**
 * Escapes HTML special characters to prevent XSS.
 * @param {string} str - The string to escape.
 * @returns {string} - The escaped string.
 */
export function escapeHTML(str) {
    if (!str) return '';
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}
