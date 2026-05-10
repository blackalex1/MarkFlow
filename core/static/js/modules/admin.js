import { ui, state } from './ui.js';
import { t, getLang } from './i18n.js';
import { escapeHTML } from './security.js';

export function initAdmin() {
    const tabItems = document.querySelectorAll('.tab-item');
    const tabContents = document.querySelectorAll('.tab-content');

    // Tab Switching (CSP Friendly)
    tabItems.forEach(tab => {
        tab.onclick = () => {
            const target = tab.dataset.tab;
            
            tabItems.forEach(t => t.classList.remove('active'));
            tabContents.forEach(c => c.classList.add('hidden'));
            
            tab.classList.add('active');
            const contentEl = document.getElementById(`tab-${target}`);
            if (contentEl) {
                contentEl.classList.remove('hidden');
            }
            
            if (target === 'users') loadUsers();
            if (target === 'logs') loadLogs();
        };
    });

    // Owner logic
    if (state.currentUser && state.currentUser.role === 'owner') {
        ui.ownerOnlyItems.forEach(item => item.classList.remove('hidden'));
    }

    if (ui.btnAdminCreateUser) {
        ui.btnAdminCreateUser.onclick = async () => {
            const u = ui.adminNewUsername.value.trim();
            const p = ui.adminNewPassword.value.trim();
            const r = ui.adminNewRole.value;
            if (!u || !p) return alert(t('error_fill_all') || 'Please fill all fields');
            
            try {
                const res = await fetch('/api/auth/users', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ username: u, password: p, role: r })
                });
                if (res.ok) {
                    ui.adminNewUsername.value = '';
                    ui.adminNewPassword.value = '';
                    loadUsers();
                } else {
                    const data = await res.json();
                    alert((t('error_generic') || 'Error') + ': ' + data.detail);
                }
            } catch (err) { console.error(err); }
        };
    }
}

export async function loadUsers() {
    const listBody = document.getElementById('users-list-body');
    if (!listBody) return;
    try {
        const res = await fetch('/api/auth/users');
        const users = await res.json();
        const currentLang = getLang();
        
        listBody.innerHTML = users.map(u => {
            const safeUsername = escapeHTML(u.username);
            return `
            <tr>
                <td>${safeUsername}</td>
                <td>
                    <select class="role-select" data-user="${safeUsername}" ${u.username === 'admin' ? 'disabled' : ''}>
                        ${['guest', 'reporter', 'developer', 'maintainer', 'owner'].map(r => 
                            `<option value="${r}" ${u.role === r ? 'selected' : ''}>${r}</option>`
                        ).join('')}
                    </select>
                </td>
                <td>
                    ${u.username !== 'admin' && u.username !== state.currentUser.username ? 
                        `<button class="btn-text delete-user-btn" data-user="${safeUsername}" style="color: var(--danger-color);">${t('btn_delete')}</button>` : 
                        `<span style="color: var(--text-muted); font-size: 11px;">(${t('status_protected')})</span>`}
                </td>
            </tr>
        `;}).join('');

        // Listeners for role change
        listBody.querySelectorAll('.role-select').forEach(sel => {
            sel.onchange = async () => {
                const username = sel.dataset.user;
                const newRole = sel.value;
                await fetch(`/api/auth/users/${username}/role`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ role: newRole })
                });
            };
        });

        // Listeners for delete
        listBody.querySelectorAll('.delete-user-btn').forEach(btn => {
            btn.onclick = async () => {
                const username = btn.dataset.user;
                if (!confirm(`${t('confirm_delete_user')} ${username}?`)) return;
                const res = await fetch(`/api/auth/users/${username}`, { method: 'DELETE' });
                if (res.ok) loadUsers();
            };
        });
    } catch (err) { console.error(err); }
}

export async function loadLogs() {
    const listBody = document.getElementById('logs-list-body');
    if (!listBody) return;
    try {
        const res = await fetch('/api/auth/audit-logs');
        const logs = await res.json();
        const locale = getLang() === 'ru' ? 'ru-RU' : 'en-US';
        
        listBody.innerHTML = logs.map(l => {
            const date = new Date(l.timestamp + 'Z').toLocaleString(locale);
            const safeUser = escapeHTML(l.username);
            const safeAction = escapeHTML(l.action);
            const safeIP = escapeHTML(l.ip_address || '-');
            const safeDetails = escapeHTML(l.details || '-');
            return `
                <tr>
                    <td style="font-size: 11px; white-space: nowrap;">${date}</td>
                    <td style="font-weight: 600;">${safeUser}</td>
                    <td><span class="tag tag-sm">${safeAction}</span></td>
                    <td style="font-family: monospace; font-size: 11px;">${safeIP}</td>
                    <td style="font-size: 12px; color: var(--text-muted);">${safeDetails}</td>
                </tr>
            `;
        }).join('');
    } catch (err) { console.error(err); }
}
