import { ui, state } from './ui.js';
import { toast } from './toasts.js';
import { initAdmin } from './admin.js';

export async function checkAuth() {
    const res = await fetch('/api/auth/me');
    const data = await res.json();
    if (data.logged_in) {
        state.currentUser = data;
    } else {
        state.currentUser = null;
    }
    initAuthListeners();
}

export function initAuthListeners() {
    if (state.currentUser && ui.btnUserDashboard) {
        ui.btnUserDashboard.onclick = async () => {
            const rolesRu = {
                "guest": "Гость",
                "reporter": "Репортер",
                "developer": "Разработчик",
                "maintainer": "Мейнтейнер",
                "owner": "Владелец"
            };
            ui.dashboardUsername.innerText = state.currentUser.username + ` (${rolesRu[state.currentUser.role] || state.currentUser.role})`;
            
            ui.dashboardModal.classList.remove('hidden');
            update2FAStatusUI();
            initAdmin();

            try {
                const res = await fetch('/api/git/config');
                const data = await res.json();
                ui.gitRemoteUrl.value = data.url || '';
                if (data.has_token) {
                    ui.gitToken.placeholder = '******** (Токен сохранен)';
                }
            } catch (err) { console.error(err); }
        };
        initDashboardListeners();
    } else if (ui.btnLoginTrigger) {
        ui.btnLoginTrigger.onclick = () => {
            ui.loginModal.classList.remove('hidden');
        };
    }
}

function update2FAStatusUI() {
    if (!state.currentUser) return;
    const isEnabled = state.currentUser.two_factor_enabled;
    ui.status2FA.innerText = isEnabled ? 'Включена' : 'Отключена';
    ui.status2FA.className = `tag ${isEnabled ? 'tag-on' : 'tag-off'}`;
    ui.btnToggle2FA.innerText = isEnabled ? 'Отключить' : 'Настроить';
    ui.desc2FA.innerText = isEnabled ? 'Ваш аккаунт защищен вторым фактором' : 'Дополнительная защита вашего аккаунта';
}

function initDashboardListeners() {
    ui.btnCloseDashboard.onclick = () => ui.dashboardModal.classList.add('hidden');
    
    const logoutBtn = document.getElementById('btn-logout');
    if (logoutBtn) logoutBtn.onclick = logout;

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
                
                if (type === 'file') {
                    // Signal for tree update (since we use a module now, we'll use an event or a direct call later)
                    window.dispatchEvent(new CustomEvent('tree-update-required'));
                    location.href = `/?p=${encodeURIComponent(data.path)}`;
                } else {
                    window.dispatchEvent(new CustomEvent('tree-update-required'));
                }
            } else {
                toast.error('Ошибка: ' + data.detail);
            }
        } catch (err) { console.error(err); }
    };

    ui.btnGitSync.onclick = async (e) => {
        ui.btnGitSync.style.opacity = '0.5';
        ui.btnGitSync.querySelector('span').innerText = 'Синхронизация...';
        
        try {
            const res = await fetch('/api/git/sync', { method: 'POST' });
            const data = await res.json();
            if (res.ok) {
                toast.success(data.message || 'Синхронизация завершена успешно!');
            } else {
                toast.error('Ошибка: ' + data.detail);
            }
        } catch (err) { console.error(err); } finally {
            ui.btnGitSync.style.opacity = '1';
            ui.btnGitSync.querySelector('span').innerText = 'Синхронизировать';
        }
    };

    ui.btnSaveGitConfig.onclick = async () => {
        const url = ui.gitRemoteUrl.value.trim();
        const token = ui.gitToken.value.trim();
        if (!url) return toast.warn('Введите URL');
        
        try {
            const res = await fetch(`/api/git/config`, { 
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ url, token: token || null })
            });
            if (res.ok) {
                toast.success('Настройки сохранены');
                ui.gitToken.value = '';
                if (token) ui.gitToken.placeholder = '******** (Токен сохранен)';
            } else {
                const data = await res.json();
                toast.error('Ошибка: ' + data.detail);
            }
        } catch (err) { console.error(err); }
    };

    ui.btnToggle2FA.onclick = async () => {
        if (state.currentUser.two_factor_enabled) {
            toast.show('Вы уверены, что хотите отключить 2FA?', 'warning', 0, {
                label: 'Отключить',
                callback: async () => {
                    try {
                        const res = await fetch('/api/auth/2fa/disable', { method: 'POST' });
                        if (res.ok) {
                            toast.success('2FA отключена');
                            state.currentUser.two_factor_enabled = false;
                            update2FAStatusUI();
                        }
                    } catch (err) { console.error(err); }
                }
            });
        } else {
            ui.dashboardModal.classList.add('hidden');
            ui.totpSetupModal.classList.remove('hidden');
            setup2FA();
        }
    };

    ui.btnChangePassword.onclick = async () => {
        const oldP = ui.oldPassword.value;
        const newP = ui.newPassword.value;
        if (!oldP || !newP) return toast.warn('Заполните поля');
        
        try {
            const res = await fetch('/api/auth/change-password', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ old_password: oldP, new_password: newP })
            });
            if (res.ok) {
                toast.success('Пароль изменен! Другие сессии завершены.');
                ui.oldPassword.value = '';
                ui.newPassword.value = '';
                ui.dashboardModal.classList.add('hidden');
            } else {
                const data = await res.json();
                toast.error('Ошибка: ' + (data.detail || 'Не удалось сменить пароль'));
            }
        } catch (err) { console.error(err); }
    };

    ui.btnLogoutAll.onclick = async () => {
        toast.show('Выйти на всех устройствах?', 'warning', 0, {
            label: 'Выйти',
            callback: async () => {
                const res = await fetch('/api/auth/logout-all', { method: 'POST' });
                if (res.ok) {
                    window.location.reload();
                }
            }
        });
    };
}

export async function login(e) {
    if (e) e.preventDefault();
    const u = ui.loginUsername.value;
    const p = ui.loginPassword.value;
    const t = ui.loginTotp.value;
    
    const payload = { username: u, password: p };
    if (t) payload.totp_code = t;
    
    const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
    });
    
    if (res.ok) {
        window.location.reload();
    } else {
        const err = await res.json();
        if (err.detail === "2fa_required") {
            ui.totpContainer.classList.remove('hidden');
            ui.loginTotp.focus();
        } else {
            toast.error(err.detail || "Неверный логин или пароль");
        }
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
        const svg = ui.totpQrContainer.querySelector('svg');
        if(svg) { svg.style.width = '100%'; svg.style.height = '100%'; }
        ui.totpSetupModal.classList.remove('hidden');
    }
}

export async function verify2FA() {
    const code = ui.setupTotpCode.value;
    if (!code || !state.setupTotpSecret) return;
    const res = await fetch('/api/auth/2fa/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ totp_code: code, secret: state.setupTotpSecret })
    });
    if (res.ok) {
        toast.success("2FA успешно включена!");
        ui.totpSetupModal.classList.add('hidden');
        state.setupTotpSecret = null;
        ui.setupTotpCode.value = '';
        if (state.currentUser) state.currentUser.two_factor_enabled = true;
        update2FAStatusUI();
    } else {
        toast.error("Неверный код.");
    }
}
