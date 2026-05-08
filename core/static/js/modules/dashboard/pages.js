import { ui } from '../ui.js';
import { toast } from '../toasts.js';
import * as i18n from '../i18n.js';

export function initPages() {
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
}
