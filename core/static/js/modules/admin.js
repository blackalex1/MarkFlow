import { ui, state } from './ui.js';
import { t } from './i18n.js';
import { loadUsers, createUser } from './admin/users.js';

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
            import('./components/dropdown.js').then(module => {
                module.initDropdown('admin-new-role-dropdown', {
                    onChange: (val, display) => {
                        roleInput.value = val;
                        roleText.innerText = display;
                    }
                });

                // Translate initial items
                roleMenu.querySelectorAll('.dropdown-item').forEach(item => {
                    const val = item.dataset.value;
                    item.innerText = t(`role_${val}`) || val;
                    if (val === roleInput.value) item.classList.add('active');
                });
                
                // Set initial translated text
                roleText.innerText = t(`role_${roleInput.value}`) || roleInput.value;
            });
        }

        ui.btnAdminCreateUser.onclick = createUser;
        ui.btnAdminCreateUser.hasListener = true;
    }
}

export { loadUsers };
