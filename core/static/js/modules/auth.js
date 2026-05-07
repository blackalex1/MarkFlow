import { ui, state } from './ui.js';
import { toast } from './toasts.js';
import { initAdmin } from './admin.js';
import * as i18n from './i18n.js';
import { update2FAStatusUI, updateCredsStatusUI, initDashboardListeners } from './dashboard.js';

export async function checkAuth() {
    const res = await fetch('/api/auth/me');
    const data = await res.json();
    state.currentUser = data.logged_in ? data : null;
    initAuthListeners();
}

export function initAuthListeners() {
    if (state.currentUser && ui.btnUserDashboard) {
        ui.btnUserDashboard.onclick = async () => {
            const rolesRu = { "guest": "Гость", "reporter": "Репортер", "developer": "Разработчик", "maintainer": "Мейнтейнер", "owner": "Владелец" };
            ui.dashboardUsername.innerText = `${state.currentUser.username} (${rolesRu[state.currentUser.role] || state.currentUser.role})`;
            ui.dashboardModal.classList.remove('hidden');
            update2FAStatusUI();
            initAdmin();
            i18n.updatePage();
            if (window.lucide) lucide.createIcons();
            try {
                const gitRes = await fetch('/api/git/config'), gitData = await gitRes.json();
                ui.gitRemoteUrl.value = gitData.url || '';
                ui.gitBranchSelect.innerHTML = `<option value="${gitData.branch || 'master'}">${gitData.branch || 'master'}</option>`;
                updateCredsStatusUI(gitData.is_valid);
                const sshRes = await fetch('/api/git/ssh-status'), sshData = await sshRes.json();
                if (sshData.has_keys) { ui.sshPublicKey.placeholder = '********'; ui.sshPrivateKey.placeholder = '********'; }
            } catch (err) {}
        };
        initDashboardListeners();
    } else if (ui.btnLoginTrigger) {
        ui.btnLoginTrigger.onclick = () => ui.loginModal.classList.remove('hidden');
    }
}

export async function login(e) {
    if (e) e.preventDefault();
    const payload = { username: ui.loginUsername.value, password: ui.loginPassword.value, totp_code: ui.loginTotp.value };
    const res = await fetch('/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
    if (res.ok) window.location.reload();
    else {
        const err = await res.json();
        if (err.detail === "2fa_required") { ui.totpContainer.classList.remove('hidden'); ui.loginTotp.focus(); }
        else toast.error(err.detail || "Error");
    }
}

export async function logout() {
    await fetch('/api/auth/logout', { method: 'POST' });
    window.location.reload();
}

export async function setup2FA() {
    const res = await fetch('/api/auth/2fa/setup');
    if (res.ok) {
        const data = await res.json();
        state.setupTotpSecret = data.secret;
        ui.totpQrContainer.innerHTML = data.qr_svg;
        ui.totpSetupModal.classList.remove('hidden');
    }
}

export async function verify2FA() {
    const res = await fetch('/api/auth/2fa/verify', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ totp_code: ui.setupTotpCode.value, secret: state.setupTotpSecret }) });
    if (res.ok) { toast.success("OK"); ui.totpSetupModal.classList.add('hidden'); state.currentUser.two_factor_enabled = true; update2FAStatusUI(); }
    else toast.error("Error");
}

window.addEventListener('setup-2fa', setup2FA);
