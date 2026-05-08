import { ui, state } from '../ui.js';
import { toast } from '../toasts.js';
import { logout } from '../auth.js';
import * as i18n from '../i18n.js';

export function update2FAStatusUI() {
    if (!state.currentUser) return;
    const isEnabled = state.currentUser.two_factor_enabled;
    ui.status2FA.innerText = isEnabled ? 'Включена' : 'Отключена';
    ui.status2FA.className = `tag ${isEnabled ? 'tag-on' : 'tag-off'}`;
    ui.btnToggle2FA.innerText = isEnabled ? 'Отключить' : 'Настроить';
    ui.desc2FA.innerText = isEnabled ? 'Ваш аккаунт защищен вторым фактором' : 'Дополнительная защита вашего аккаунта';
}

export function updateCredsStatusUI(isValid) {
    const container = document.getElementById('ssh-status-icon-container');
    if (!container) return;
    const iconName = isValid ? 'check-circle' : 'x-circle';
    const color = isValid ? '#10b981' : '#ef4444';
    container.innerHTML = `<i id="ssh-status-icon" data-lucide="${iconName}" style="color: ${color}; width: 20px; height: 20px;"></i>`;
    if (window.lucide) lucide.createIcons();
}

export function initSettings() {
    if (ui.btnOpenSSHModal) {
        ui.btnOpenSSHModal.onclick = () => {
            ui.modalSSH.classList.remove('hidden');
            fetch('/api/git/pubkey').then(r => r.json()).then(data => { 
                ui.sshPublicKey.value = data.pubkey || ''; 
                const privCont = document.getElementById('privkey-input-container');
                if (privCont) privCont.classList.add('hidden');
                const btnSave = document.getElementById('btn-save-ssh-keys');
                if (btnSave) btnSave.classList.add('hidden');
            });
        };
        const closeSSH = document.getElementById('close-ssh-settings');
        if (closeSSH) closeSSH.onclick = () => ui.modalSSH.classList.add('hidden');
    }

    const btnShowPriv = document.getElementById('btn-show-privkey-input');
    if (btnShowPriv) {
        btnShowPriv.onclick = () => {
            const privCont = document.getElementById('privkey-input-container');
            const btnSave = document.getElementById('btn-save-ssh-keys');
            if (privCont) privCont.classList.toggle('hidden');
            if (btnSave) btnSave.classList.toggle('hidden');
            ui.sshPublicKey.readOnly = !ui.sshPublicKey.readOnly;
            ui.sshPublicKey.style.background = ui.sshPublicKey.readOnly ? 'rgba(0,0,0,0.2)' : 'transparent';
        };
    }

    if (ui.btnGenerateSSHKey) {
        ui.btnGenerateSSHKey.onclick = () => {
            toast.show(i18n.t('confirm_gen_ssh'), 'warning', 0, { label: i18n.t('btn_confirm_gen'), callback: async () => {
                const res = await fetch('/api/git/generate-key', { method: 'POST' });
                const data = await res.json();
                if (res.ok) { 
                    ui.sshPublicKey.value = data.pubkey; 
                    updateCredsStatusUI(true); 
                    toast.success('Generated & Saved on server!'); 
                }
            }});
        };
    }

    const btnSaveSSH = document.getElementById('btn-save-ssh-keys');
    if (btnSaveSSH) {
        btnSaveSSH.onclick = async () => {
            const private_key = ui.sshPrivateKey.value, public_key = ui.sshPublicKey.value;
            if (!private_key || !public_key) return toast.warn('Fill both keys');
            const res = await fetch('/api/git/set-ssh-key', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ private_key, public_key }) });
            if (res.ok) { 
                toast.success('Saved'); 
                ui.sshPrivateKey.value = '';
                const privCont = document.getElementById('privkey-input-container');
                if (privCont) privCont.classList.add('hidden');
                btnSaveSSH.classList.add('hidden');
                updateCredsStatusUI(true); 
            }
        };
    }

    if (ui.btnToggle2FA) {
        ui.btnToggle2FA.onclick = async () => {
            if (state.currentUser.two_factor_enabled) {
                toast.show('Disable 2FA?', 'warning', 0, { label: 'Disable', callback: async () => {
                    const res = await fetch('/api/auth/2fa/disable', { method: 'POST' });
                    if (res.ok) { state.currentUser.two_factor_enabled = false; update2FAStatusUI(); }
                }});
            } else {
                ui.dashboardModal.classList.add('hidden');
                ui.totpSetupModal.classList.remove('hidden');
                window.dispatchEvent(new CustomEvent('setup-2fa'));
            }
        };
    }

    if (ui.btnChangePassword) {
        ui.btnChangePassword.onclick = async () => {
            const old_password = ui.oldPassword.value, new_password = ui.newPassword.value;
            if (!old_password || !new_password) return toast.warn('Заполните оба поля');
            
            try {
                const res = await fetch('/api/auth/change-password', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ old_password, new_password })
                });
                const data = await res.json();
                if (res.ok) {
                    toast.success('Пароль изменен! Пожалуйста, войдите снова.');
                    setTimeout(() => logout(), 1500);
                } else {
                    toast.error(data.detail || 'Ошибка');
                }
            } catch (err) {
                toast.error('Ошибка сети');
            }
        };
    }

    if (ui.btnLogoutAll) {
        ui.btnLogoutAll.onclick = async () => {
            if (confirm('Выйти со всех устройств?')) {
                const res = await fetch('/api/auth/logout-all', { method: 'POST' });
                if (res.ok) logout();
            }
        };
    }
}
