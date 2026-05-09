export async function confirmAction(title, message, confirmText = 'Confirm', cancelText = 'Cancel') {
    return new Promise((resolve) => {
        const modal = document.getElementById('confirm-modal');
        const titleEl = document.getElementById('confirm-title');
        const msgEl = document.getElementById('confirm-message');
        const btnConfirm = document.getElementById('confirm-btn-yes');
        const btnCancel = document.getElementById('confirm-btn-no');

        if (!modal) {
            // Fallback to native if modal not found for some reason
            resolve(confirm(message));
            return;
        }

        titleEl.textContent = title;
        msgEl.textContent = message;
        btnConfirm.textContent = confirmText;
        btnCancel.textContent = cancelText;

        modal.classList.remove('hidden');

        const cleanup = (result) => {
            modal.classList.add('hidden');
            btnConfirm.onclick = null;
            btnCancel.onclick = null;
            resolve(result);
        };

        btnConfirm.onclick = () => cleanup(true);
        btnCancel.onclick = () => cleanup(false);
        
        // Close on overlay click
        modal.onclick = (e) => {
            if (e.target === modal) cleanup(false);
        };
    });
}

window.confirmAction = confirmAction;
