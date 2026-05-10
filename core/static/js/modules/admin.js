import { ui, state } from './ui.js';
import { t, getLang } from './i18n.js';
import { escapeHTML } from './security.js';

export function initAdmin() {
    // Owner logic
    if (state.currentUser && state.currentUser.role === 'owner') {
        ui.ownerOnlyItems.forEach(item => item.classList.remove('hidden'));
    }

    if (ui.btnAdminCreateUser && !ui.btnAdminCreateUser.hasListener) {
        // Setup role dropdown logic
        const roleDropdown = document.getElementById('admin-new-role-dropdown');
        const roleTrigger = document.getElementById('admin-new-role-trigger');
        const roleMenu = document.getElementById('admin-new-role-menu');
        const roleText = document.getElementById('admin-new-role-text');
        const roleInput = document.getElementById('admin-new-role');

        if (roleTrigger && roleMenu) {
            roleTrigger.onclick = (e) => {
                e.stopPropagation();
                roleMenu.classList.toggle('hidden');
                roleDropdown.classList.toggle('is-open');
            };

            roleMenu.querySelectorAll('.dropdown-item').forEach(item => {
                const val = item.dataset.value;
                // Translate initial items
                item.innerText = t(`role_${val}`) || val;

                item.onclick = (e) => {
                    e.stopPropagation();
                    const value = item.dataset.value;
                    roleInput.value = value;
                    roleText.innerText = item.innerText;
                    roleMenu.classList.add('hidden');
                    roleDropdown.classList.remove('is-open');
                };
            });

            // Close on click outside
            document.addEventListener('click', () => {
                roleMenu.classList.add('hidden');
                roleDropdown.classList.remove('is-open');
            });
            
            // Set initial translated text
            roleText.innerText = t(`role_${roleInput.value}`) || roleInput.value;
        }

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
        ui.btnAdminCreateUser.hasListener = true;
    }
}


export async function loadUsers() {
    const container = document.getElementById('users-table-container');
    if (!container) return;
    try {
        const res = await fetch('/api/auth/users');
        const users = await res.json();
        
        const rows = users.map(u => {
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

        container.innerHTML = `
            <table class="admin-table">
                <thead>
                    <tr>
                        <th data-t="users_th_user">${t('users_th_user') || 'User'}</th>
                        <th style="white-space: nowrap;" data-t="users_th_role">${t('users_th_role') || 'Role'}</th>
                        <th style="white-space: nowrap; text-align: right;" data-t="users_th_actions">${t('users_th_actions') || 'Actions'}</th>
                    </tr>
                </thead>
                <tbody id="users-list-body">
                    ${users.map(u => {
                        const safeUsername = escapeHTML(u.username);
                        return `
                        <tr>
                            <td>${safeUsername}</td>
                            <td style="white-space: nowrap;">
                                <select class="role-select" data-user="${safeUsername}" ${u.username === 'admin' ? 'disabled' : ''}>
                                    ${['guest', 'reporter', 'developer', 'maintainer', 'owner'].map(r => 
                                        `<option value="${r}" ${u.role === r ? 'selected' : ''}>${r}</option>`
                                    ).join('')}
                                </select>
                            </td>
                            <td style="white-space: nowrap; text-align: right;">
                                ${u.username !== 'admin' && u.username !== state.currentUser.username ? 
                                    `<button class="btn-text delete-user-btn" data-user="${safeUsername}" style="color: var(--danger-color);">${t('btn_delete')}</button>` : 
                                    `<span style="color: var(--text-muted); font-size: 11px;">(${t('status_protected')})</span>`}
                            </td>
                        </tr>
                    `;}).join('')}
                </tbody>
            </table>
        `;

        const listBody = container.querySelector('#users-list-body');

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
