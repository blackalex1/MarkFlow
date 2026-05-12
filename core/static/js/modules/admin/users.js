import { ui, state } from '../ui.js';
import { t } from '../i18n.js';
import { escapeHTML } from '../security.js';

// Setup global listener once
if (!window._roleDropdownInitialized) {
    document.addEventListener('click', (e) => {
        if (!e.target.closest('.role-dropdown')) {
            document.querySelectorAll('.role-menu.show').forEach(m => m.classList.remove('show'));
            document.querySelectorAll('.role-trigger.active').forEach(t => t.classList.remove('active'));
            document.querySelectorAll('.role-dropdown.active').forEach(d => d.classList.remove('active'));
        }
    });
    
    // Close on scroll to prevent detached menus
    document.addEventListener('scroll', () => {
        document.querySelectorAll('.role-menu.show').forEach(m => m.classList.remove('show'));
        document.querySelectorAll('.role-trigger.active').forEach(t => t.classList.remove('active'));
        document.querySelectorAll('.role-dropdown.active').forEach(d => d.classList.remove('active'));
    }, true);

    window._roleDropdownInitialized = true;
}

export async function loadUsers() {
    const container = document.getElementById('users-table-container');
    if (!container) return;
    try {
        const res = await fetch('/api/auth/users');
        const users = await res.json();
        
        const roles = ['guest', 'reporter', 'developer', 'maintainer', 'owner'];
        
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
                        const isProtected = u.username === 'admin';
                        return `
                        <tr>
                            <td>${safeUsername}</td>
                            <td style="white-space: nowrap;">
                                <div class="role-dropdown" data-user="${safeUsername}">
                                    <div class="role-trigger ${isProtected ? 'disabled' : ''}" id="role-trigger-${safeUsername}">
                                        <span>${u.role}</span>
                                        <svg class="dropdown-arrow" xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m6 9 6 6 6-6"/></svg>
                                    </div>
                                    ${!isProtected ? `
                                    <div class="role-menu" id="role-menu-${safeUsername}">
                                        ${roles.map(r => `
                                            <div class="dropdown-item ${u.role === r ? 'active' : ''}" data-role="${r}">${r}</div>
                                        `).join('')}
                                    </div>
                                    ` : ''}
                                </div>
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

        // Handle dropdown logic
        container.querySelectorAll('.role-dropdown').forEach(dropdown => {
            const username = dropdown.dataset.user;
            const trigger = dropdown.querySelector('.role-trigger');
            const menu = dropdown.querySelector('.role-menu');
            
            if (!menu) return; // Protected user

            trigger.addEventListener('click', (e) => {
                e.stopPropagation();
                const isShowing = menu.classList.contains('show');
                
                // Close all other dropdowns
                document.querySelectorAll('.role-menu.show').forEach(m => m.classList.remove('show'));
                document.querySelectorAll('.role-trigger.active').forEach(t => t.classList.remove('active'));
                document.querySelectorAll('.role-dropdown.active').forEach(d => d.classList.remove('active'));
                
                if (!isShowing) {
                    const rect = trigger.getBoundingClientRect();
                    menu.style.position = 'fixed';
                    menu.style.top = `${rect.bottom + 5}px`;
                    menu.style.left = `${rect.left}px`;
                    menu.style.width = `${rect.width}px`;
                    menu.style.minWidth = '140px';
                    
                    menu.classList.add('show');
                    trigger.classList.add('active');
                    dropdown.classList.add('active');
                }
            });

            menu.querySelectorAll('.dropdown-item').forEach(item => {
                item.addEventListener('click', async (e) => {
                    e.stopPropagation();
                    const newRole = item.dataset.role;
                    trigger.querySelector('span').textContent = newRole;
                    menu.classList.remove('show');
                    trigger.classList.remove('active');
                    dropdown.classList.remove('active');
                    
                    try {
                        const res = await fetch(`/api/auth/users/${username}/role`, {
                            method: 'PUT',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ role: newRole })
                        });
                        if (!res.ok) throw new Error('Failed to update role');
                    } catch (err) {
                        console.error(err);
                        loadUsers(); // Revert on error
                    }
                });
            });
        });

        // Listeners for delete
        container.querySelectorAll('.delete-user-btn').forEach(btn => {
            btn.addEventListener('click', async () => {
                const username = btn.dataset.user;
                if (!confirm(`${t('confirm_delete_user')} ${username}?`)) return;
                const res = await fetch(`/api/auth/users/${username}`, { method: 'DELETE' });
                if (res.ok) loadUsers();
            });
        });
    } catch (err) { console.error(err); }
}

export async function createUser() {
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
}
