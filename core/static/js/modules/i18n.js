import { ru } from './i18n/ru.js';
import { en } from './i18n/en.js';

export const translations = { ru, en };

function detectLanguage() {
    const saved = localStorage.getItem('lang');
    if (saved) return saved;
    
    const navLang = navigator.language || navigator.userLanguage;
    if (navLang && navLang.toLowerCase().startsWith('ru')) {
        return 'ru';
    }
    return 'en';
}

let currentLang = detectLanguage();

export function getLang() {
    return currentLang;
}

export function setLang(lang) {
    currentLang = lang;
    localStorage.setItem('lang', lang);
    updatePage();
}

export function t(key, placeholders = {}) {
    let text = translations[currentLang][key] || key;
    for (const [k, v] of Object.entries(placeholders)) {
        text = text.replace(`{${k}}`, v);
    }
    return text;
}

export function updatePage(root = document) {
    root.querySelectorAll('[data-t]').forEach(el => {
        const key = el.dataset.t;
        if (el.tagName === 'INPUT' && (el.type === 'text' || el.type === 'password' || el.type === 'search') && el.placeholder) {
            el.placeholder = t(key);
        } else if (key.endsWith('_html')) {
            el.innerHTML = t(key);
        } else {
            el.textContent = t(key);
        }
    });
    
    // Update titles for icon buttons
    root.querySelectorAll('[data-t-title]').forEach(el => {
        el.title = t(el.dataset.tTitle);
    });
}

// Expose to window for dynamic JS templates
window.i18n = { t, getLang, setLang, updatePage };

