import { ui, state } from './ui.js';

export function initAdmin() {
    // Tab Switching
    ui.tabItems.forEach(tab => {
        tab.onclick = () => {
            ui.tabItems.forEach(t => t.classList.remove('active'));
            ui.tabContents.forEach(c => c.classList.add('hidden'));
            tab.classList.add('active');
            const target = tab.dataset.tab;
            document.getElementById(`tab-${target}`).classList.remove('hidden');
            
            if (target === 'users') loadUsers();
            if (target === 'logs') loadLogs();
        };
    });

    // Owner logic
    if (state.currentUser && state.currentUser.role === 'owner') {
        ui.ownerOnlyItems.forEach(item => item.classList.remove('hidden'));
    }

    ui.btnAdminCreateUser.onclick = async () => {
        const u = ui.adminNewUsername.value.trim();
        const p = ui.adminNewPassword.value.trim();
        const r = ui.adminNewRole.value;
        if (!u || !p) return alert('Заполните все поля');
        
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
                alert('Ошибка: ' + data.detail);
            }
        } catch (err) { console.error(err); }
    };
}

export async function loadUsers() {
    try {
        const res = await fetch('/api/auth/users');
        const users = await res.json();
        ui.usersListBody.innerHTML = users.map(u => `
            <tr>
                <td>${u.username}</td>
                <td>
                    <select class="role-select" data-user="${u.username}" ${u.username === 'admin' ? 'disabled' : ''}>
                        ${['guest', 'reporter', 'developer', 'maintainer', 'owner'].map(r => 
                            `<option value="${r}" ${u.role === r ? 'selected' : ''}>${r}</option>`
                        ).join('')}
                    </select>
                </td>
                <td>
                    ${u.username !== 'admin' && u.username !== state.currentUser.username ? 
                        `<button class="btn-text delete-user-btn" data-user="${u.username}" style="color: var(--danger-color);">Удалить</button>` : 
                        '<span style="color: var(--text-muted); font-size: 11px;">(Защищено)</span>'}
                </td>
            </tr>
        `).join('');

        // Listeners for role change
        ui.usersListBody.querySelectorAll('.role-select').forEach(sel => {
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
        ui.usersListBody.querySelectorAll('.delete-user-btn').forEach(btn => {
            btn.onclick = async () => {
                const username = btn.dataset.user;
                if (!confirm(`Удалить пользователя ${username}?`)) return;
                const res = await fetch(`/api/auth/users/${username}`, { method: 'DELETE' });
                if (res.ok) loadUsers();
            };
        });
    } catch (err) { console.error(err); }
}

export async function loadLogs() {
    try {
        const res = await fetch('/api/auth/audit-logs');
        const logs = await res.json();
        ui.logsListBody.innerHTML = logs.map(l => {
            const date = new Date(l.timestamp + 'Z').toLocaleString('ru-RU');
            return `
                <tr>
                    <td style="font-size: 11px; white-space: nowrap;">${date}</td>
                    <td style="font-weight: 600;">${l.username}</td>
                    <td><span class="tag tag-sm">${l.action}</span></td>
                    <td style="font-size: 12px; color: var(--text-muted);">${l.details || '-'}</td>
                </tr>
            `;
        }).join('');
    } catch (err) { console.error(err); }
}
