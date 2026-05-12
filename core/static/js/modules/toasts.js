/**
 * Toast notification module for non-blocking UI messages.
 */

class ToastManager {
    constructor() {}

    show(message, type = 'info', duration = 4000, action = null, position = 'bottom-right') {
        let container = document.getElementById(`toast-container-${position}`);
        if (!container) {
            container = document.createElement('div');
            container.id = `toast-container-${position}`;
            container.className = `toast-container toast-container-${position}`;
            document.body.appendChild(container);
        }

        const toast = document.createElement('div');
        toast.className = `toast toast-${type} fade-in toast-${position}`;
        
        const icon = this.getIcon(type);
        let displayMessage = message;
        if (typeof message !== 'string') {
            if (Array.isArray(message)) {
                // Handle FastAPI validation error lists
                displayMessage = message.map(m => m.msg || JSON.stringify(m)).join(', ');
            } else if (message && typeof message === 'object') {
                displayMessage = message.detail || message.message || JSON.stringify(message);
            } else {
                displayMessage = String(message);
            }
        }

        toast.innerHTML = `
            <div class="toast-content">
                <i class="toast-icon">${icon}</i>
                <span class="toast-message">${displayMessage}</span>
            </div>
            <button class="toast-close">&times;</button>
        `;

        if (action) {
            const actionBtn = document.createElement('button');
            actionBtn.className = 'toast-action';
            actionBtn.innerText = action.label;
            actionBtn.onclick = () => {
                action.callback();
                this.remove(toast);
            };
            toast.querySelector('.toast-content').appendChild(actionBtn);
        }

        container.appendChild(toast);

        toast.querySelector('.toast-close').onclick = () => this.remove(toast);

        if (duration > 0) {
            setTimeout(() => this.remove(toast), duration);
        }

        return toast;
    }

    remove(toast) {
        toast.classList.replace('fade-in', 'fade-out');
        toast.addEventListener('animationend', () => {
            if (toast.parentNode) {
                toast.remove();
            }
        });
    }

    getIcon(type) {
        switch(type) {
            case 'success': return '✓';
            case 'error': return '✕';
            case 'warning': return '⚠';
            default: return 'ℹ';
        }
    }

    // Sugar methods
    success(msg, dur) { return this.show(msg, 'success', dur); }
    error(msg, dur) { return this.show(msg, 'error', dur); }
    warn(msg, dur) { return this.show(msg, 'warning', dur); }
    info(msg, dur) { return this.show(msg, 'info', dur); }

    /**
     * Confirmation toast with buttons
     */
    confirm(message, onConfirm, onCancel) {
        return this.show(message, 'warning', 0, {
            label: 'Confirm',
            callback: onConfirm
        });
    }
}

const manager = new ToastManager();

/**
 * Main toast function - callable as toast(msg, type)
 */
export const toast = (message, type, duration, action) => manager.show(message, type, duration, action);

// Attach sugar methods to the function for toast.show(), toast.success() style calls
toast.show = (msg, type, dur, act) => manager.show(msg, type, dur, act);
toast.success = (msg, dur) => manager.success(msg, dur);
toast.error = (msg, dur) => manager.error(msg, dur);
toast.warn = (msg, dur) => manager.warn(msg, dur);
toast.info = (msg, dur) => manager.info(msg, dur);
toast.confirm = (msg, onConfirm, onCancel) => manager.confirm(msg, onConfirm, onCancel);
