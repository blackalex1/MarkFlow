/**
 * Editor Module Entry Point
 */
import { ui } from '../modules/ui.js';
import { createEditor } from './instance.js';
import * as actions from './actions.js';

export const init = async () => {
    if (!ui.contentEditor) return;

    // We no longer initialize the editor here. 
    // It will be initialized lazily in actions.enterEditMode()

    // Bind UI Actions
    if (ui.btnEdit) ui.btnEdit.onclick = actions.enterEditMode;
    if (ui.btnSave) ui.btnSave.onclick = actions.saveContent;
    if (ui.btnCancel) ui.btnCancel.onclick = () => actions.exitEditMode(false, true);
    
    // Status and visibility are handled by modules/status.js
    
    if (ui.statusDropdown && !ui.statusDropdown.dataset.listener) {
        const trigger = ui.statusDropdown.querySelector('.dropdown-trigger');
        const menu = document.getElementById('status-dropdown-menu');
        
        const { renderStatusDropdown, updateStatusDisplay } = await import('../modules/status.js');

        trigger.onclick = (e) => {
            e.stopPropagation();
            ui.statusDropdown.classList.toggle('is-open');
            menu.classList.toggle('hidden');
        };

        renderStatusDropdown(menu, (val, name) => {
            updateStatusDisplay(val);
            actions.updateStatus(val);
            ui.statusDropdown.classList.remove('is-open');
            menu.classList.add('hidden');
        });

        // Close when clicking outside
        document.addEventListener('click', () => {
            ui.statusDropdown.classList.remove('is-open');
            menu.classList.add('hidden');
        });

        ui.statusDropdown.dataset.listener = "true";
    }
};

export { actions };
