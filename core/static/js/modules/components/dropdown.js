import { t } from '../i18n.js';

/**
 * Initializes a custom dropdown based on a container element.
 * Structure:
 * <div class="custom-dropdown" id="my-dropdown">
 *   <div class="dropdown-trigger">
 *     <span class="trigger-text">Select...</span>
 *     <i data-lucide="chevron-down" class="select-arrow"></i>
 *   </div>
 *   <div class="dropdown-menu">
 *     <div class="dropdown-item" data-value="val1">Item 1</div>
 *     ...
 *   </div>
 *   <input type="hidden" name="my-val" />
 * </div>
 */
export function initDropdown(containerId, options = {}) {
    const container = document.getElementById(containerId);
    if (!container) return null;

    const trigger = container.querySelector('.dropdown-trigger');
    const menu = container.querySelector('.dropdown-menu');
    const text = container.querySelector('.trigger-text') || trigger.querySelector('span');
    const input = container.querySelector('input[type="hidden"]');
    const items = container.querySelectorAll('.dropdown-item');

    const toggle = (force) => {
        const isOpen = typeof force === 'boolean' ? force : !container.classList.contains('is-open');
        
        // Close all other dropdowns first
        if (isOpen) {
            document.querySelectorAll('.custom-dropdown.is-open').forEach(d => {
                if (d !== container) d.classList.remove('is-open');
            });
        }

        container.classList.toggle('is-open', isOpen);
    };

    trigger.onclick = (e) => {
        e.stopPropagation();
        toggle();
    };

    items.forEach(item => {
        item.onclick = (e) => {
            e.stopPropagation();
            const val = item.dataset.value || item.dataset.role || item.innerText;
            const display = item.innerText;

            if (input) input.value = val;
            if (text) text.innerText = display;

            // Update active class
            items.forEach(i => i.classList.remove('active'));
            item.classList.add('active');

            toggle(false);

            if (options.onChange) {
                options.onChange(val, display, item);
            }

            // Dispatch change event on container
            container.dispatchEvent(new CustomEvent('change', { detail: { value: val, text: display } }));
        };
    });

    // Close on click outside
    document.addEventListener('click', (e) => {
        if (!container.contains(e.target)) {
            toggle(false);
        }
    });

    return {
        setValue: (val) => {
            const item = Array.from(items).find(i => (i.dataset.value || i.dataset.role) === val);
            if (item) {
                if (input) input.value = val;
                if (text) text.innerText = item.innerText;
                items.forEach(i => i.classList.remove('active'));
                item.classList.add('active');
            }
        },
        getValue: () => input ? input.value : null
    };
}

/**
 * Transforms a native <select> into a premium custom dropdown.
 * If already transformed, it syncs the custom dropdown with the select's current state.
 */
export function transformSelect(selectId, options = {}) {
    const select = document.getElementById(selectId);
    if (!select) return null;

    const containerId = `custom-${selectId}`;
    let wrapper = document.getElementById(containerId);
    let isNew = false;

    if (!wrapper) {
        wrapper = document.createElement('div');
        wrapper.id = containerId;
        isNew = true;
    }

    // Copy classes but remove hidden ones
    let classes = select.className.replace('hidden', '').replace('none', '').trim();
    wrapper.className = `custom-dropdown ${classes}`;
    if (select.style.width) wrapper.style.width = select.style.width;

    const selectedOption = select.options[select.selectedIndex] || select.options[0];
    const initialText = selectedOption ? (selectedOption.getAttribute('data-t') ? t(selectedOption.getAttribute('data-t')) : selectedOption.text) : 'Select...';
    const initialValue = selectedOption ? selectedOption.value : '';

    let itemsHtml = '';
    for (const opt of select.options) {
        const transKey = opt.getAttribute('data-t');
        const display = transKey ? t(transKey) : opt.text;
        const isActive = opt.value === initialValue;
        itemsHtml += `<div class="dropdown-item ${isActive ? 'active' : ''}" data-value="${opt.value}">${display}</div>`;
    }

    wrapper.innerHTML = `
        <div class="dropdown-trigger">
            <span class="trigger-text">${initialText}</span>
            <i data-lucide="chevron-down" class="select-arrow"></i>
        </div>
        <div class="dropdown-menu">
            ${itemsHtml}
        </div>
        <input type="hidden" id="${selectId}-hidden" value="${initialValue}">
    `;

    // Always ensure it's in the right place and select is hidden
    if (select.parentNode && wrapper.parentNode !== select.parentNode) {
        select.parentNode.insertBefore(wrapper, select);
    }
    select.classList.add('hidden');
    select.style.display = 'none';

    if (window.lucide) lucide.createIcons();

    // Store options for reuse on re-transformation
    if (Object.keys(options).length > 0) {
        wrapper._dropdownOptions = options;
    } else if (wrapper._dropdownOptions) {
        options = wrapper._dropdownOptions;
    }

    // Re-initialize dropdown logic to attach listeners to NEW elements
    return initDropdown(containerId, {
        onChange: (val, display, item) => {
            select.value = val;
            select.dispatchEvent(new Event('change'));
            if (options.onChange) options.onChange(val, display, item);
        }
    });
}
