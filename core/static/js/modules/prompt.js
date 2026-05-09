export async function promptAction(title, message, placeholder = '', confirmText = 'OK', cancelText = 'Cancel') {
    return new Promise((resolve) => {
        const modal = document.getElementById('prompt-modal');
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
        
        btnConfirm.innerText = confirmText;
        btnCancel.innerText = cancelText;
        
        modal.classList.remove('hidden');
        setTimeout(() => inputEl.focus(), 50);

        const cleanup = (result) => {
            modal.classList.add('hidden');
            btnConfirm.onclick = null;
            btnCancel.onclick = null;
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

        inputEl.onkeydown = (e) => {
            if (e.key === 'Enter') btnConfirm.click();
            if (e.key === 'Escape') btnCancel.click();
        };
    });
}

window.promptAction = promptAction;
