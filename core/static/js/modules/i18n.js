export const translations = {
    ru: {
        // Sidebar & UI
        search_placeholder: "Перейти к...",
        theme_toggle: "Сменить тему",
        login_btn: "Войти",
        dashboard_btn: "Личный кабинет",
        welcome_title: "Добро пожаловать",
        welcome_msg: "Выберите документ в боковой панели для просмотра.",
        toc_title: "Содержание",

        // Login Modal
        login_title: "Вход в систему",
        login_welcome: "С возвращением!",
        username_label: "Имя пользователя",
        password_label: "Пароль",
        totp_label: "Код 2FA (если включен)",
        btn_login_submit: "Войти в аккаунт",
        
        // Errors
        error_access_denied: "Доступ ограничен",
        error_not_found: "Страница не найдена",
        error_generic: "Произошла ошибка",
        error_access_denied_msg: "У вас недостаточно прав для просмотра этого контента. Пожалуйста, войдите в систему.",
        error_not_found_msg: "Запрашиваемый файл не найден. Возможно, он был перемещен или удален.",
        btn_retry: "Повторить",
        btn_home: "На главную",
        btn_signin: "Войти",

        // Dashboard
        tab_account: "Аккаунт",
        tab_pages: "Контент",
        tab_users: "Пользователи",
        tab_git: "Git",
        tab_logs: "Логи",
        logout_btn: "Выйти из системы",
        logout_all_btn: "Выйти на всех устройствах",
        
        // Editor
        btn_edit: "Редактировать",
        btn_save: "Сохранить",
        btn_cancel: "Отмена",
        btn_delete: "Удалить",
        
        // Settings
        sec_2fa: "Безопасность (2FA)",
        sec_password: "Смена пароля",
        old_password: "Старый пароль",
        new_password: "Новый пароль",
        
        // Editor Hints
        hint_h2: "Заголовок 2",
        hint_h2_desc: "Заголовок среднего уровня",
        hint_h3: "Заголовок 3",
        hint_h3_desc: "Малый заголовок",
        hint_table: "Таблица",
        hint_table_desc: "Вставить таблицу 2x2",
        hint_code: "Код",
        hint_code_desc: "Блок кода с подсветкой",
        hint_note: "Заметка",
        hint_note_desc: "Блок примечания [!NOTE]",
        hint_tabs: "Вкладки",
        hint_tabs_desc: "Контейнер с вкладками",
        
        tt_bold: "Жирный (Ctrl+B)",
        tt_italic: "Курсив (Ctrl+I)",
        tt_link: "Ссылка (Ctrl+L)",
        tt_quote: "Цитата"
    },
    en: {
        // Sidebar & UI
        search_placeholder: "Jump to...",
        theme_toggle: "Toggle Theme",
        login_btn: "Login",
        dashboard_btn: "Dashboard",
        welcome_title: "Welcome",
        welcome_msg: "Select a document from the sidebar to view.",
        toc_title: "Table of Contents",

        // Login Modal
        login_title: "Sign In",
        login_welcome: "Welcome back!",
        username_label: "Username",
        password_label: "Password",
        totp_label: "2FA Code (if enabled)",
        btn_login_submit: "Sign In",

        // Errors
        error_access_denied: "Access Denied",
        error_not_found: "Page Not Found",
        error_generic: "An error occurred",
        error_access_denied_msg: "You don't have enough permissions to view this content. Please sign in.",
        error_not_found_msg: "The requested file could not be found. It might have been moved or deleted.",
        btn_retry: "Retry",
        btn_home: "Go Home",
        btn_signin: "Sign In",

        // Dashboard
        tab_account: "Account",
        tab_pages: "Content",
        tab_users: "Users",
        tab_git: "Git",
        tab_logs: "Audit Logs",
        logout_btn: "Logout",
        logout_all_btn: "Logout from all devices",

        // Editor
        btn_edit: "Edit",
        btn_save: "Save",
        btn_cancel: "Cancel",
        btn_delete: "Delete",

        // Settings
        sec_2fa: "Security (2FA)",
        sec_password: "Change Password",
        old_password: "Old Password",
        new_password: "New Password",
        
        // Editor Hints
        hint_h2: "Heading 2",
        hint_h2_desc: "Medium section heading",
        hint_h3: "Heading 3",
        hint_h3_desc: "Small section heading",
        hint_table: "Table",
        hint_table_desc: "Insert a 2x2 table",
        hint_code: "Code Block",
        hint_code_desc: "Fenced code block",
        hint_note: "Note Callout",
        hint_note_desc: "[!NOTE] block",
        hint_tabs: "Tabs",
        hint_tabs_desc: "Tabbed container",
        
        tt_bold: "Bold (Ctrl+B)",
        tt_italic: "Italic (Ctrl+I)",
        tt_link: "Link (Ctrl+L)",
        tt_quote: "Quote"
    }
};

function detectLanguage() {
    const saved = localStorage.getItem('lang');
    if (saved) return saved;
    
    const navLang = navigator.language || navigator.userLanguage;
    if (navLang && navLang.toLowerCase().startsWith('ru')) {
        return 'ru';
    }
    return 'en';
}

let currentLang = detectLanguage();

export function getLang() {
    return currentLang;
}

export function setLang(lang) {
    currentLang = lang;
    localStorage.setItem('lang', lang);
    updatePage();
}

export function t(key) {
    return translations[currentLang][key] || key;
}

export function updatePage() {
    document.querySelectorAll('[data-t]').forEach(el => {
        const key = el.dataset.t;
        if (el.tagName === 'INPUT' && el.placeholder) {
            el.placeholder = t(key);
        } else {
            el.textContent = t(key);
        }
    });
    
    // Update titles for icon buttons
    document.querySelectorAll('[data-t-title]').forEach(el => {
        el.title = t(el.dataset.tTitle);
    });
}
