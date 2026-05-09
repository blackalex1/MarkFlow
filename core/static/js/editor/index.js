/**
 * Editor Module Entry Point
 */
import { ui } from '../modules/ui.js';
import { createEditor } from './instance.js';
import * as actions from './actions.js';

export const init = () => {
    if (!ui.contentEditor) return;

    // We no longer initialize the editor here. 
    // It will be initialized lazily in actions.enterEditMode()

    // Bind UI Actions
    if (ui.btnEdit) ui.btnEdit.onclick = actions.enterEditMode;
    if (ui.btnSave) ui.btnSave.onclick = actions.saveContent;
    if (ui.btnCancel) ui.btnCancel.onclick = () => actions.exitEditMode(false);
    
    if (ui.visibilityCheckbox) {
        ui.visibilityCheckbox.onchange = (e) => actions.updateVisibility(e.target.checked);
    }
    
    if (ui.statusDropdown) {
        const trigger = ui.statusDropdown.querySelector('.dropdown-trigger');
        const menu = ui.statusDropdown.querySelector('.dropdown-menu');
        const items = ui.statusDropdown.querySelectorAll('.dropdown-item');
        const statusText = document.getElementById('current-status-text');

        trigger.onclick = (e) => {
            e.stopPropagation();
            ui.statusDropdown.classList.toggle('is-open');
            menu.classList.toggle('hidden');
        };

        items.forEach(item => {
            item.onclick = () => {
                const val = item.getAttribute('data-value');
                statusText.textContent = item.textContent;
                statusText.setAttribute('data-t', item.getAttribute('data-t'));
                
                actions.updateStatus(val);
                
                ui.statusDropdown.classList.remove('is-open');
                menu.classList.add('hidden');
            };
        });

        // Close when clicking outside
        document.addEventListener('click', () => {
            ui.statusDropdown.classList.remove('is-open');
            menu.classList.add('hidden');
        });
    }
};

export { actions };
