import { ui, state } from './ui.js';
import { toast } from './toasts.js';
import { initAdmin } from './admin.js';
import * as i18n from './i18n.js';
import { logout } from './auth.js';

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

export function initDashboardListeners() {
    if (ui.btnCloseDashboard) ui.btnCloseDashboard.onclick = () => ui.dashboardModal.classList.add('hidden');
    
    const logoutBtn = document.getElementById('btn-logout');
    if (logoutBtn) logoutBtn.onclick = logout;

    if (ui.btnCreatePage) {
        ui.btnCreatePage.onclick = async () => {
            const name = ui.newPageName.value.trim();
            if (!name) return toast.warn('Введите название');
            const type = ui.newItemType.value;
            const endpoint = type === 'folder' ? '/api/files/mkdir' : '/api/files/create';
            try {
                const res = await fetch(`${endpoint}?path=${encodeURIComponent(name)}`, { method: 'POST' });
                const data = await res.json();
                if (res.ok) {
                    toast.success(type === 'folder' ? 'Папка создана!' : 'Страница создана!');
                    ui.dashboardModal.classList.add('hidden');
                    ui.newPageName.value = '';
                    window.dispatchEvent(new CustomEvent('tree-update-required'));
                    if (type === 'file') location.href = `/?p=${encodeURIComponent(data.path)}`;
                } else toast.error('Ошибка: ' + data.detail);
            } catch (err) { console.error(err); }
        };
    }

    if (ui.btnGitSync) {
        ui.btnGitSync.onclick = async () => {
            const url = ui.gitRemoteUrl.value.trim(), branch = ui.gitBranchSelect.value || 'master';
            if (url) await fetch(`/api/git/config`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ url, branch }) });
            ui.btnGitSync.disabled = true;
            const originalText = ui.btnGitSync.innerText;
            ui.btnGitSync.innerText = i18n.t('btn_syncing') || 'Syncing...';
            try {
                const res = await fetch('/api/git/sync', { method: 'POST' });
                const data = await res.json();
                if (res.ok) toast.success(data.message || 'Успешно!');
                else toast.error('Ошибка: ' + (data.detail || 'Error'));
            } finally {
                ui.btnGitSync.disabled = false;
                ui.btnGitSync.innerText = originalText;
            }
        };
    }

    if (ui.btnFetchBranches) {
        ui.btnFetchBranches.onclick = async () => {
            const url = ui.gitRemoteUrl.value.trim();
            if (!url) return toast.warn('Введите URL');
            ui.btnFetchBranches.disabled = true;
            ui.btnFetchBranches.innerText = '...';
            try {
                await fetch(`/api/git/config`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ url, branch: ui.gitBranchSelect.value }) });
                const res = await fetch('/api/git/branches');
                const data = await res.json();
                if (res.ok && data.branches) {
                    ui.gitBranchSelect.innerHTML = data.branches.map(b => `<option value="${b}">${b}</option>`).join('');
                    toast.success('OK');
                } else toast.error('Error: ' + data.detail);
            } finally {
                ui.btnFetchBranches.disabled = false;
                ui.btnFetchBranches.innerText = i18n.t('btn_fetch_branches') || 'Fetch';
            }
        };
    }

    if (ui.btnSaveGitConfig) {
        ui.btnSaveGitConfig.onclick = async () => {
            const url = ui.gitRemoteUrl.value.trim(), branch = ui.gitBranchSelect.value || 'master';
            const res = await fetch(`/api/git/config`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ url, branch }) });
            if (res.ok) toast.success('Saved');
            else toast.error('Error');
        };
    }

    if (ui.btnOpenSSHModal) {
        ui.btnOpenSSHModal.onclick = () => {
            ui.modalSSH.classList.remove('hidden');
            fetch('/api/git/pubkey').then(r => r.json()).then(data => { 
                ui.sshPublicKey.value = data.pubkey || ''; 
                const privCont = document.getElementById('privkey-input-container');
                if (privCont) privCont.classList.add('hidden');
                if (ui.btnSaveSSHKeys) ui.btnSaveSSHKeys.classList.add('hidden');
            });
        };
        const closeSSH = document.getElementById('close-ssh-settings');
        if (closeSSH) closeSSH.onclick = () => ui.modalSSH.classList.add('hidden');
    }

    const btnShowPriv = document.getElementById('btn-show-privkey-input');
    if (btnShowPriv) {
        btnShowPriv.onclick = () => {
            const privCont = document.getElementById('privkey-input-container');
            if (privCont) privCont.classList.toggle('hidden');
            if (ui.btnSaveSSHKeys) ui.btnSaveSSHKeys.classList.toggle('hidden');
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

    if (ui.btnSaveSSHKeys) {
        ui.btnSaveSSHKeys.onclick = async () => {
            const private_key = ui.sshPrivateKey.value, public_key = ui.sshPublicKey.value;
            if (!private_key || !public_key) return toast.warn('Fill both keys');
            const res = await fetch('/api/git/set-ssh-key', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ private_key, public_key }) });
            if (res.ok) { 
                toast.success('Saved'); 
                ui.sshPrivateKey.value = '';
                const privCont = document.getElementById('privkey-input-container');
                if (privCont) privCont.classList.add('hidden');
                ui.btnSaveSSHKeys.classList.add('hidden');
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
}
