import { ui, state } from '../ui.js';
import { toast } from '../toasts.js';
import { logout } from '../auth.js';
import * as i18n from '../i18n.js';
import { API } from '../api.js';

export function update2FAStatusUI() {
    if (!state.currentUser) return;
    const isEnabled = state.currentUser.two_factor_enabled;
    const status2FA = document.getElementById('2fa-status-tag');
    const btnToggle2FA = document.getElementById('btn-toggle-2fa');
    const desc2FA = document.getElementById('2fa-description');
    
    if (status2FA) {
        status2FA.innerText = i18n.t(isEnabled ? 'totp_status_on' : 'totp_status_off');
        status2FA.className = `tag ${isEnabled ? 'tag-on' : 'tag-off'}`;
    }
    if (btnToggle2FA) {
        btnToggle2FA.innerText = i18n.t(isEnabled ? 'totp_btn_disable' : 'totp_btn_setup');
    }
    if (desc2FA) {
        desc2FA.innerText = i18n.t(isEnabled ? 'sec_2fa_desc_on' : 'sec_2fa_desc_off');
    }
}

export function updateCredsStatusUI(isValid) {
    const container = document.getElementById('ssh-status-icon-container');
    if (!container) return;
    const iconName = isValid ? 'check-circle' : 'x-circle';
    const color = isValid ? '#10b981' : '#ef4444';
    container.innerHTML = `<i id="ssh-status-icon" data-lucide="${iconName}" style="color: ${color}; width: 20px; height: 20px;"></i>`;
    if (window.lucide) lucide.createIcons();
}

export async function loadGlobalSSHKey() {
    if (state.currentUser?.role !== 'owner' && state.currentUser?.role !== 'maintainer') return;
    try {
        const res = await fetch(API.GIT_PUBKEY);
        const data = await res.json();
        const sshPublicKey = document.getElementById('ssh-public-key');
        if (sshPublicKey) sshPublicKey.value = data.pubkey || '';
    } catch (e) { console.error(e); }
}

export function initSettings() {
    // 1. Account Settings (Available to all roles)
    const btnToggle2FA = document.getElementById('btn-toggle-2fa');
    if (btnToggle2FA) {
        btnToggle2FA.onclick = async () => {
            const isEnabled = state.currentUser ? state.currentUser.two_factor_enabled : false;
            if (isEnabled) {
                const password = await window.promptAction(
                    i18n.t('sec_2fa_disable_title'), 
                    i18n.t('sec_2fa_disable_prompt'), 
                    '', 
                    i18n.t('sec_2fa_disable_confirm'), 
                    i18n.t('btn_cancel'), 
                    true
                );
                if (!password) return;

                const totp_code = await window.promptAction(
                    i18n.t('sec_2fa_disable_title'),
                    i18n.t('sec_2fa_disable_code_prompt'),
                    i18n.t('sec_2fa_disable_code_placeholder'),
                    i18n.t('sec_2fa_disable_confirm'),
                    i18n.t('btn_cancel'),
                    false
                );
                if (!totp_code) return;

                const res = await fetch('/api/auth/2fa/disable', { 
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ password, totp_code })
                });
                if (res.ok) { 
                    if (state.currentUser) state.currentUser.two_factor_enabled = false; 
                    update2FAStatusUI(); 
                    toast.success(i18n.t('toast_2fa_disabled'));
                } else {
                    const err = await res.json();
                    toast.error(err.detail || i18n.t('toast_2fa_disable_failed'));
                }
            } else {
                const dashboardModal = document.getElementById('user-dashboard-modal');
                const totpSetupModal = document.getElementById('totp-setup-modal');
                if (dashboardModal) dashboardModal.classList.add('hidden');
                if (totpSetupModal) totpSetupModal.classList.remove('hidden');
                window.dispatchEvent(new CustomEvent('setup-2fa'));
            }
        };
    }

    const btnChangePassword = document.getElementById('btn-change-password');
    if (btnChangePassword) {
        btnChangePassword.onclick = async () => {
            const oldPasswordEl = document.getElementById('old-password');
            const newPasswordEl = document.getElementById('new-password');
            const old_password = oldPasswordEl ? oldPasswordEl.value : '';
            const new_password = newPasswordEl ? newPasswordEl.value : '';
            if (!old_password || !new_password) return toast.warn(i18n.t('sec_pass_fill_both'));
            
            try {
                const res = await fetch('/api/auth/change-password', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ old_password, new_password })
                });
                const data = await res.json();
                if (res.ok) {
                    toast.success(i18n.t('sec_pass_changed'));
                    setTimeout(() => logout(), 1500);
                } else {
                    toast.error(data.detail || i18n.t('error_generic'));
                }
            } catch (err) {
                toast.error(i18n.t('sec_network_error'));
            }
        };
    }

    const btnLogoutAll = document.getElementById('btn-logout-all');
    if (btnLogoutAll) {
        btnLogoutAll.onclick = async () => {
            if (confirm(i18n.t('sec_logout_all_confirm'))) {
                const res = await fetch('/api/auth/logout-all', { method: 'POST' });
                if (res.ok) logout();
            }
        };
    }

    // 2. Git/SSH Settings (Only available to owner and maintainer)
    if (state.currentUser?.role !== 'owner' && state.currentUser?.role !== 'maintainer') return;
    
    if (ui.sshPublicKey) ui.sshPublicKey.value = '';

    if (ui.btnCopySSHKey) {
        ui.btnCopySSHKey.onclick = () => {
            if (!ui.sshPublicKey.value) return toast.warn(i18n.t('warn_load_key_first'));
            ui.sshPublicKey.select();
            document.execCommand('copy');
            toast.success(i18n.t('toast_pubkey_copied'));
        };
    }

    if (ui.btnLoadSSHKey) {
        ui.btnLoadSSHKey.onclick = () => loadGlobalSSHKey();
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
        ui.btnGenerateSSHKey.onclick = async () => {
            const confirmed = await window.confirmAction(
                i18n.t('git_regen_global_title'),
                i18n.t('git_regen_global_warn'),
                i18n.t('git_regen_global_btn'),
                i18n.t('btn_cancel')
            );
            
            if (confirmed) {
                const res = await fetch(API.GIT_GENERATE_GLOBAL_KEY, { method: 'POST' });
                const data = await res.json();
                if (res.ok) { 
                    ui.sshPublicKey.value = data.pubkey; 
                    updateCredsStatusUI(true); 
                    toast.success(i18n.t('toast_generated_saved')); 
                }
            }
        };
    }

    const btnSaveSSH = document.getElementById('btn-save-ssh-keys');
    if (btnSaveSSH) {
        btnSaveSSH.onclick = async () => {
            const private_key = ui.sshPrivateKey.value, public_key = ui.sshPublicKey.value;
            if (!private_key || !public_key) return toast.warn('Fill both keys');
            const res = await fetch(API.GIT_SET_GLOBAL_SSH_KEY, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ private_key, public_key }) });
            if (res.ok) { 
                toast.success(i18n.t('toast_ssh_saved')); 
                ui.sshPrivateKey.value = '';
                const privCont = document.getElementById('privkey-input-container');
                if (privCont) privCont.classList.add('hidden');
                btnSaveSSH.classList.add('hidden');
                updateCredsStatusUI(true); 
            }
        };
    }
}
