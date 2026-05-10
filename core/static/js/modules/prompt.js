export async function promptAction(title, message, placeholder = '', confirmText = 'OK', cancelText = 'Cancel', isPassword = false) {
    return new Promise((resolve) => {
        const modal = document.getElementById('prompt-modal');
        const content = modal?.querySelector('.modal-content');
        const titleEl = document.getElementById('prompt-title');
        const msgEl = document.getElementById('prompt-message');
        const inputEl = document.getElementById('prompt-input');
        const btnConfirm = document.getElementById('prompt-btn-confirm');
        const btnCancel = document.getElementById('prompt-btn-cancel');

        if (!modal || !inputEl) {
            resolve(prompt(message));
            return;
        }

        titleEl.innerText = title;
        msgEl.innerText = message;
        inputEl.value = '';
        inputEl.placeholder = placeholder;
        inputEl.type = isPassword ? 'password' : 'text';
        
        btnConfirm.innerText = confirmText;
        btnCancel.innerText = cancelText;
        
        modal.classList.remove('hidden');
        modal.classList.add('fade-in');
        if (content) content.classList.add('animate-pop');

        setTimeout(() => inputEl.focus(), 50);

        const cleanup = (result) => {
            modal.classList.add('hidden');
            modal.classList.remove('fade-in');
            if (content) content.classList.remove('animate-pop');
            btnConfirm.onclick = null;
            btnCancel.onclick = null;
            modal.onclick = null;
            inputEl.onkeydown = null;
            resolve(result);
        };

        btnConfirm.onclick = () => {
            const val = inputEl.value.trim();
            cleanup(val || null);
        };

        btnCancel.onclick = () => {
            cleanup(null);
        };

        modal.onclick = (e) => {
            if (e.target === modal) cleanup(null);
        };

        inputEl.onkeydown = (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                btnConfirm.click();
            }
            if (e.key === 'Escape') {
                e.preventDefault();
                btnCancel.click();
            }
        };
    });
}

window.promptAction = promptAction;
