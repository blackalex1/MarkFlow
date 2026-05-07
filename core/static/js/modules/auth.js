import { ui, state } from './ui.js';
import { toast } from './toasts.js';
import { initAdmin } from './admin.js';
import * as i18n from './i18n.js';

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
            i18n.updatePage();
            if (window.lucide) lucide.createIcons();

            try {
                const res = await fetch('/api/git/config');
                const data = await res.json();
                ui.gitRemoteUrl.value = data.url || '';
                if (data.branch) {
                    ui.gitBranchSelect.innerHTML = `<option value="${data.branch}">${data.branch}</option>`;
                } else {
                    ui.gitBranchSelect.innerHTML = `<option value="master">master</option>`;
                }
                console.log("Git config:", data);
                updateCredsStatusUI(data.is_valid);
                
                // Check SSH status
                const statusRes = await fetch('/api/git/ssh-status');
                const statusData = await statusRes.json();
                if (statusData.has_keys) {
                    ui.sshPublicKey.placeholder = '******** (Keys present)';
                    ui.sshPrivateKey.placeholder = '******** (Keys present)';
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
        const url = ui.gitRemoteUrl.value.trim();
        const branch = ui.gitBranchSelect.value || 'master';
        
        // Auto-save config if provided
        if (url) {
            try {
                await fetch(`/api/git/config`, { 
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ url, branch })
                });
            } catch (err) { console.error("Auto-save failed:", err); }
        }

        ui.btnGitSync.disabled = true;
        const originalText = ui.btnGitSync.innerText;
        ui.btnGitSync.innerText = i18n.t('btn_syncing') || 'Syncing...';
        
        try {
            const res = await fetch('/api/git/sync', { method: 'POST' });
            const data = await res.json();
            if (res.ok) {
                toast.success(data.message || 'Синхронизация завершена успешно!');
            } else {
                toast.error('Ошибка: ' + (data.detail || 'Unknown error'));
            }
        } catch (err) { 
            console.error(err);
            toast.error('Network error during sync');
        } finally {
            ui.btnGitSync.disabled = false;
            ui.btnGitSync.innerText = originalText;
        }
    };

        ui.btnFetchBranches.onclick = async () => {
            const url = ui.gitRemoteUrl.value.trim();
            if (!url) return toast.warn('Введите URL репозитория');
            
            ui.btnFetchBranches.disabled = true;
            ui.btnFetchBranches.innerText = 'Загрузка...';
            
            try {
                // Ensure config is saved before fetching branches if changed
                const currentBranch = ui.gitBranchSelect.value;
                await fetch(`/api/git/config`, { 
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ url, branch: currentBranch })
                });

                const res = await fetch('/api/git/branches');
                const data = await res.json();
                
                if (res.ok && data.branches) {
                    ui.gitBranchSelect.innerHTML = data.branches.map(b => 
                        `<option value="${b}" ${b === currentBranch ? 'selected' : ''}>${b}</option>`
                    ).join('');
                    toast.success('Список веток обновлен');
                } else {
                    toast.error('Ошибка: ' + (data.detail || 'Не удалось получить ветки'));
                }
            } catch (err) { 
                console.error(err);
                toast.error('Ошибка сети при получении веток');
            } finally {
                ui.btnFetchBranches.disabled = false;
                ui.btnFetchBranches.innerText = i18n.t('btn_fetch_branches') || 'Fetch Branches';
            }
        };
    if (ui.gitRemoteUrl) {
        ui.gitRemoteUrl.oninput = () => {
            const val = ui.gitRemoteUrl.value.trim();
            // GitHub auto-conversion
            if (val.startsWith('https://github.com/')) {
                let path = val.replace('https://github.com/', '');
                if (path.endsWith('/')) path = path.slice(0, -1);
                // Ensure it ends with .git for SSH
                let cleanPath = path.replace(/\.git$/, '');
                const sshUrl = `git@github.com:${cleanPath}.git`;
                ui.gitRemoteUrl.value = sshUrl;
                toast.show('URL автоматически конвертирован в SSH формат', 'info');
            }
        };
    }

    // Git Config Save
    ui.btnSaveGitConfig.onclick = async () => {
        const url = ui.gitRemoteUrl.value.trim();
        const branch = ui.gitBranchSelect.value || 'master';
        if (!url) return toast.warn('Введите URL');
        
        try {
            const res = await fetch(`/api/git/config`, { 
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ url, branch })
            });
            if (res.ok) {
                toast.success('Конфигурация сохранена');
            } else {
                const data = await res.json();
                toast.error('Ошибка: ' + data.detail);
            }
        } catch (err) { console.error(err); }
    };
        


    if (ui.btnOpenSSHModal && ui.modalSSH) {
        ui.btnOpenSSHModal.onclick = () => {
            ui.modalSSH.classList.remove('hidden');
            // Fetch pubkey if exists to show in modal
            fetch('/api/git/pubkey').then(r => r.json()).then(data => {
                if (data.pubkey) ui.sshPublicKey.value = data.pubkey;
            });
        };

        const closeBtn = ui.modalSSH.querySelector('.btn-close');
        if (closeBtn) {
            closeBtn.onclick = () => {
                ui.modalSSH.classList.add('hidden');
            };
        }
    }

    if (ui.btnGenerateSSHKey) {
        ui.btnGenerateSSHKey.onclick = async () => {
            toast.show(i18n.t('confirm_gen_ssh'), 'warning', 0, {
                label: i18n.t('btn_confirm_gen'),
                callback: async () => {
                    try {
                        const res = await fetch('/api/git/generate-key', { method: 'POST' });
                        const data = await res.json();
                        if (res.ok) {
                            ui.sshPublicKey.value = data.pubkey;
                            ui.sshPrivateKey.value = data.privkey;
                            updateCredsStatusUI(true);
                            toast.success(i18n.t('success_ssh_gen') || 'SSH key generated!');
                        } else {
                            toast.error('Ошибка: ' + data.detail);
                        }
                    } catch (err) { console.error(err); }
                }
            });
        };
    }

    if (ui.btnSaveSSHKeys) {
        ui.btnSaveSSHKeys.onclick = async () => {
            const private_key = ui.sshPrivateKey.value;
            const public_key = ui.sshPublicKey.value;
            if (!private_key || !public_key) return toast.warn('Заполните оба поля ключей');
            
            try {
                const res = await fetch('/api/git/set-ssh-key', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ private_key, public_key })
                });
                if (res.ok) {
                    toast.success('SSH ключи сохранены');
                    ui.sshPrivateKey.value = '';
                    ui.sshPublicKey.value = '';
                    ui.sshPrivateKey.placeholder = '******** (Saved)';
                    ui.sshPublicKey.placeholder = '******** (Saved)';
                    updateCredsStatusUI(true);
                    ui.modalSSH.classList.add('hidden');
                } else {
                    const data = await res.json();
                    toast.error('Ошибка: ' + data.detail);
                }
            } catch (err) { console.error(err); }
        };
    }

    if (ui.btnCopySSHKey) {
        ui.btnCopySSHKey.onclick = async () => {
            let val = ui.sshPublicKey.value;
            if (!val) {
                // Try fetching from server
                try {
                    const res = await fetch('/api/git/pubkey');
                    const data = await res.json();
                    val = data.pubkey;
                } catch (err) { console.error(err); }
            }
            
            if (!val) return toast.warn('Ключ еще не создан');
            navigator.clipboard.writeText(val).then(() => {
                toast.success('Скопировано в буфер обмена');
            });
        };
    }

    if (ui.sshPublicKey && ui.sshPrivateKey) {
        [ui.sshPublicKey, ui.sshPrivateKey].forEach(el => {
            el.onblur = () => {
                if (el.value) el.classList.add('blur-sensitive');
            };
            el.onfocus = () => {
                el.classList.remove('blur-sensitive');
            };
        });
    }

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

function updateCredsStatusUI(isValid) {
    const container = document.getElementById('ssh-status-icon-container');
    if (!container) return;
    
    const iconName = isValid ? 'check-circle' : 'x-circle';
    const color = isValid ? '#10b981' : '#ef4444';
    
    container.innerHTML = `<i id="ssh-status-icon" data-lucide="${iconName}" style="color: ${color}; width: 20px; height: 20px;"></i>`;
    
    if (window.lucide) lucide.createIcons();
}
