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
    
    if (ui.statusSelect) {
        ui.statusSelect.onchange = (e) => actions.updateStatus(e.target.value);
    }
};

export { actions };
