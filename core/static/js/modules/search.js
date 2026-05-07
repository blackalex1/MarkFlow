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
        searchTimeout = setTimeout(() => performSearch(q, ui.searchResults), 300);
    };

    // Quick Switcher logic
    let qsTimeout;
    ui.qsInput.oninput = () => {
        clearTimeout(qsTimeout);
        const q = ui.qsInput.value.trim();
        if (q.length < 2) {
            ui.qsResults.innerHTML = '';
            return;
        }
        qsTimeout = setTimeout(() => performSearch(q, ui.qsResults), 300);
    };

    // Keyboard shortcuts
    document.addEventListener('keydown', (e) => {
        // Cmd+K or Ctrl+K
        if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
            e.preventDefault();
            toggleQuickSwitcher(true);
        }
        
        // Escape to close
        if (e.key === 'Escape') {
            toggleQuickSwitcher(false);
            ui.searchResults.classList.add('hidden');
        }

        // Navigation in Quick Switcher
        if (!ui.qsModal.classList.contains('hidden')) {
            const results = ui.qsResults.querySelectorAll('.search-result');
            const active = ui.qsResults.querySelector('.search-result.active');
            let index = Array.from(results).indexOf(active);

            if (e.key === 'ArrowDown') {
                e.preventDefault();
                if (index < results.length - 1) {
                    if (active) active.classList.remove('active');
                    results[index + 1].classList.add('active');
                    results[index + 1].scrollIntoView({ block: 'nearest' });
                }
            } else if (e.key === 'ArrowUp') {
                e.preventDefault();
                if (index > 0) {
                    if (active) active.classList.remove('active');
                    results[index - 1].classList.add('active');
                    results[index - 1].scrollIntoView({ block: 'nearest' });
                }
            } else if (e.key === 'Enter') {
                if (active) {
                    active.click();
                }
            }
        }
    });

    // Close results when clicking outside
    document.addEventListener('click', (e) => {
        if (ui.searchInput && !ui.searchInput.contains(e.target) && !ui.searchResults.contains(e.target)) {
            ui.searchResults.classList.add('hidden');
        }
        if (ui.qsModal && !ui.qsModal.classList.contains('hidden') && e.target === ui.qsModal) {
            toggleQuickSwitcher(false);
        }
    });
}

function toggleQuickSwitcher(show) {
    if (show) {
        ui.qsModal.classList.remove('hidden');
        ui.qsInput.value = '';
        ui.qsResults.innerHTML = '';
        setTimeout(() => ui.qsInput.focus(), 50);
    } else {
        ui.qsModal.classList.add('hidden');
    }
}

async function performSearch(q, container) {
    try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(q)}`);
        const data = await res.json();
        
        if (data.results.length > 0) {
            container.innerHTML = data.results.map((r, idx) => `
                <div class="search-result ${idx === 0 && container === ui.qsResults ? 'active' : ''}" data-path="${r.path}">
                    <div class="search-item-name">${r.name}</div>
                    <div class="search-item-snippet">${r.snippet}</div>
                </div>
            `).join('');
            
            container.querySelectorAll('.search-result').forEach(el => {
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
            container.innerHTML = '<div class="search-no-results">Ничего не найдено</div>';
            container.classList.remove('hidden');
        }
    } catch (err) { console.error(err); }
}
