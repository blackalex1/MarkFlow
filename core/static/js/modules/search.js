import { ui } from './ui.js';
import { loadFileContent } from './viewer.js';

export function initSearch() {
    let searchTimeout;
    ui.searchInput.oninput = () => {
        clearTimeout(searchTimeout);
        const q = ui.searchInput.value.trim();
        if (q.length < 2) {
            ui.searchResults.classList.add('hidden');
            return;
        }
        searchTimeout = setTimeout(() => performSearch(q), 300);
    };

    // Close results when clicking outside
    document.addEventListener('click', (e) => {
        if (!ui.searchInput.contains(e.target) && !ui.searchResults.contains(e.target)) {
            ui.searchResults.classList.add('hidden');
        }
    });
}

async function performSearch(q) {
    try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(q)}`);
        const data = await res.json();
        
        if (data.results.length > 0) {
            ui.searchResults.innerHTML = data.results.map(r => `
                <div class="search-result" data-path="${r.path}">
                    <div class="search-item-name">${r.name}</div>
                    <div class="search-item-snippet">${r.snippet}</div>
                </div>
            `).join('');
            
            ui.searchResults.querySelectorAll('.search-result').forEach(el => {
                el.onclick = () => {
                    loadFileContent(el.dataset.path);
                    ui.searchResults.classList.add('hidden');
                    ui.searchInput.value = '';
                };
            });
            ui.searchResults.classList.remove('hidden');
        } else {
            ui.searchResults.innerHTML = '<div class="search-no-results">Ничего не найдено</div>';
            ui.searchResults.classList.remove('hidden');
        }
    } catch (err) { console.error(err); }
}
