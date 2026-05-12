import { ui } from '../ui.js';
import { loadFileContent } from '../viewer.js';
import { API } from '../api.js';

export function toggleQuickSwitcher(show) {
    if (show) {
        ui.qsModal.classList.remove('hidden');
        ui.qsInput.value = '';
        ui.qsResults.innerHTML = '';
        setTimeout(() => ui.qsInput.focus(), 50);
    } else {
        ui.qsModal.classList.add('hidden');
    }
}

function escapeHTML(str) {
    const p = document.createElement('p');
    p.textContent = str;
    return p.innerHTML;
}

export async function performSearch(q, container) {
    try {
        const res = await fetch(`${API.SEARCH}?q=${encodeURIComponent(q)}`);
        if (!res.ok) throw new Error(`Search failed: ${res.status}`);
        const data = await res.json();
        
        if (data && data.results && data.results.length > 0) {
            container.innerHTML = data.results.map((r, idx) => {
                let snippet = r.snippet;
                if (!snippet.includes('<b>') && !snippet.includes('<mark>')) {
                    const regex = new RegExp(`(${q})`, 'gi');
                    snippet = snippet.replace(regex, '<mark>$1</mark>');
                }

                return `
                <div class="search-item ${idx === 0 && container === ui.qsResults ? 'active' : ''}" data-path="${r.path}">
                    <div class="search-item-icon">
                        <i data-lucide="file-text"></i>
                    </div>
                    <div class="search-item-content">
                        <div class="search-item-title">${escapeHTML(r.name)}</div>
                        <div class="search-item-snippet">${DOMPurify.sanitize(snippet)}</div>
                    </div>
                </div>
            `;
            }).join('');
            
            if (window.lucide) window.lucide.createIcons();
            
            container.querySelectorAll('.search-item').forEach(el => {
                el.onclick = () => {
                    loadFileContent(el.dataset.path);
                    if (container === ui.qsResults) {
                        toggleQuickSwitcher(false);
                    } else {
                        ui.searchResults.classList.add('hidden');
                        ui.searchInput.value = '';
                    }
                };
            });
            container.classList.remove('hidden');
        } else {
            container.innerHTML = `
                <div class="search-no-results">
                    <i data-lucide="search-x"></i>
                    <span>Nothing found</span>
                </div>
            `;
            if (window.lucide) window.lucide.createIcons();
            container.classList.remove('hidden');
        }
    } catch (err) { console.error(err); }
}
