import { API } from '../api.js';
import { toast } from '../toasts.js';
import { t } from '../i18n.js';
import { loadStatuses } from '../status.js';
import { escapeHTML } from '../security.js';
import { initSpectrumPicker } from '../color-picker-logic.js';

import { renderStatusesTable, createStatus } from './statuses/logic.js';


export function initStatuses() {
    const btnCreate = document.getElementById('btn-admin-create-status');
    if (btnCreate) {
        btnCreate.onclick = createStatus;
    }

    // Custom Color Picker logic
    const colorTrigger = document.getElementById('status-color-trigger');
    const colorDropdown = document.getElementById('status-color-dropdown');
    const colorPreviewCircle = document.getElementById('status-color-preview-circle');
    const colorValueDisplay = document.getElementById('status-color-value');
    const colorInput = document.getElementById('status-new-color');
    const swatches = colorDropdown ? colorDropdown.querySelectorAll('.color-swatch') : [];

    const updateColorPreview = (color) => {
        if (!/^#(?:[0-9a-fA-F]{3}){1,2}$/.test(color)) return;
        if (colorValueDisplay) colorValueDisplay.innerText = color;
        if (colorPreviewCircle) colorPreviewCircle.style.backgroundColor = color;
        if (colorInput) colorInput.value = color;
        
        swatches.forEach(s => {
            s.classList.toggle('active', s.dataset.color && s.dataset.color.toLowerCase() === color.toLowerCase());
        });
    };

    if (colorTrigger) {
        colorTrigger.onclick = (e) => {
            e.stopPropagation();
            colorDropdown.classList.toggle('active');
        };
    }

    document.addEventListener('click', (e) => {
        if (colorDropdown && !colorDropdown.contains(e.target) && !colorTrigger.contains(e.target)) {
            colorDropdown.classList.remove('active');
        }
    });

    swatches.forEach(swatch => {
        swatch.onclick = () => {
            const color = swatch.dataset.color;
            if (color) {
                updateColorPreview(color);
                colorDropdown.classList.remove('active');
            }
        };
    });

    // Custom Spectrum Picker logic
    initSpectrumPicker({
        canvasId: 'status-spectrum-canvas',
        cursorId: 'status-spectrum-cursor',
        hueSliderId: 'status-hue-slider',
        triggerId: 'status-spectrum-trigger',
        containerId: 'status-spectrum-container',
        valueInputId: 'status-new-color',
        onUpdate: (color) => {
            updateColorPreview(color);
        }
    });

    if (colorInput) {
        colorInput.oninput = (e) => {
            let color = e.target.value;
            if (color && !color.startsWith('#')) color = '#' + color;
            updateColorPreview(color);
        };
    }

    if (window.lucide) window.lucide.createIcons();
}

export { renderStatusesTable };

