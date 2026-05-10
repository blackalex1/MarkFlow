export async function confirmAction(title, message, confirmText = 'Confirm', cancelText = 'Cancel') {
    return new Promise((resolve) => {
        const modal = document.getElementById('confirm-modal');
        const content = modal?.querySelector('.modal-content');
        const titleEl = document.getElementById('confirm-title');
        const msgEl = document.getElementById('confirm-message');
        const btnConfirm = document.getElementById('confirm-btn-yes');
        const btnCancel = document.getElementById('confirm-btn-no');

        if (!modal) {
            resolve(confirm(message));
            return;
        }

        titleEl.textContent = title;
        msgEl.textContent = message;
        btnConfirm.textContent = confirmText;
        btnCancel.textContent = cancelText;

        modal.classList.remove('hidden');
        modal.classList.add('fade-in');
        if (content) content.classList.add('animate-pop');

        const cleanup = (result) => {
            modal.classList.add('hidden');
            modal.classList.remove('fade-in');
            if (content) content.classList.remove('animate-pop');
            btnConfirm.onclick = null;
            btnCancel.onclick = null;
            modal.onclick = null;
            window.removeEventListener('keydown', handleKeydown);
            resolve(result);
        };

        const handleKeydown = (e) => {
            if (e.key === 'Escape') cleanup(false);
            if (e.key === 'Enter') cleanup(true);
        };

        btnConfirm.onclick = () => cleanup(true);
        btnCancel.onclick = () => cleanup(false);
        
        modal.onclick = (e) => {
            if (e.target === modal) cleanup(false);
        };

        window.addEventListener('keydown', handleKeydown);
    });
}

window.confirmAction = confirmAction;
