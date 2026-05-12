import { ui } from './ui.js';
import { loadFileContent } from './viewer.js';
import { API } from './api.js';

import { toggleQuickSwitcher, performSearch } from './search/logic.js';

export function initSearch() {
    let searchTimeout;
    if (ui.searchInput) {
        ui.searchInput.oninput = () => {
            clearTimeout(searchTimeout);
            const q = ui.searchInput.value.trim();
            if (q.length < 2) {
                ui.searchResults.classList.add('hidden');
                return;
            }
            searchTimeout = setTimeout(() => performSearch(q, ui.searchResults), 300);
        };
    }

    // Quick Switcher logic
    let qsTimeout;
    if (ui.qsInput) {
        ui.qsInput.oninput = () => {
            clearTimeout(qsTimeout);
            const q = ui.qsInput.value.trim();
            if (q.length < 2) {
                ui.qsResults.innerHTML = '';
                return;
            }
            qsTimeout = setTimeout(() => performSearch(q, ui.qsResults), 300);
        };
    }

    // Keyboard shortcuts
    document.addEventListener('keydown', (e) => {
        // Cmd+K or Ctrl+K (handle both English and Russian layouts)
        if ((e.metaKey || e.ctrlKey) && (e.code === 'KeyK' || e.key.toLowerCase() === 'k' || e.key.toLowerCase() === 'к')) {
            e.preventDefault();
            toggleQuickSwitcher(true);
        }
        
        // Escape to close
        if (e.key === 'Escape') {
            toggleQuickSwitcher(false);
            if (ui.searchResults) ui.searchResults.classList.add('hidden');
        }

        // Navigation in Quick Switcher
        if (ui.qsModal && !ui.qsModal.classList.contains('hidden')) {
            const results = ui.qsResults.querySelectorAll('.search-item');
            const active = ui.qsResults.querySelector('.search-item.active');
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
        if (ui.searchInput && !ui.searchInput.contains(e.target) && ui.searchResults && !ui.searchResults.contains(e.target)) {
            ui.searchResults.classList.add('hidden');
        }
        if (ui.qsModal && !ui.qsModal.classList.contains('hidden') && e.target === ui.qsModal) {
            toggleQuickSwitcher(false);
        }
    });
}


