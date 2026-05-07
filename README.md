# 🌊 MarkFlow

**MarkFlow** — это современная, легковесная и безопасная платформа для ведения документации в стиле Notion. Она спроектирована для команд, которым важна эстетика, гибкость Markdown и надежность синхронизации через Git.

![License](https://img.shields.io/badge/license-MIT-blue.svg)
![Python](https://img.shields.io/badge/python-3.9+-green.svg)
![FastAPI](https://img.shields.io/badge/FastAPI-v0.100+-009688.svg)

---

## ✨ Основные возможности

*   **🧱 Модульная архитектура**: Чистый и поддерживаемый код на ES6 модулях и раздельных CSS-компонентах.
*   **🔐 Безопасность (RBAC)**: Продвинутая система ролей (Guest, Reporter, Developer, Maintainer, Owner).
*   **📱 2FA Аутентификация**: Поддержка Google Authenticator (TOTP) для защиты административного доступа.
*   **🔄 Git-синхронизация**: Автоматический Pull/Push вашей документации в удаленный репозиторий.
*   **📝 Markdown+**: Поддержка расширений, таких как `@tabs` для удобной организации контента.
*   **🎨 Премиальный дизайн**: Темная и светлая темы с использованием Glassmorphism и плавных анимаций.
*   **🔎 Быстрый поиск**: Мгновенный поиск по всей базе знаний с предпросмотром фрагментов.

## 🚀 Технологический стек

*   **Backend**: FastAPI (Python), SQLite, ItsDangerous (сессии).
*   **Frontend**: Vanilla JS (ES6 Modules), CSS3 (Variables, Grid, Flexbox).
*   **Библиотеки**: 
    *   `Lucide` — современные иконки.
    *   `Marked` + `DOMPurify` — безопасный рендеринг Markdown.
    *   `Highlight.js` — подсветка синтаксиса.
    *   `EasyMDE` — удобный редактор.

## 📦 Быстрый старт

1.  **Клонируйте репозиторий:**
    ```bash
    git clone https://github.com/blackalex1/MarkFlow.git
    cd MarkFlow
    ```

2.  **Настройте окружение:**
    ```bash
    python -m venv venv
    source venv/bin/activate  # Или venv\Scripts\activate для Windows
    pip install -r requirements.txt
    ```

3.  **Запустите сервер:**
    ```bash
    uvicorn core.main:app --reload
    ```

4.  **Вход в админ-панель:**
    По умолчанию: `admin` / `admin` (не забудьте сменить пароль при первом входе!).

## 🛠 Структура проекта

*   `core/` — Основной код приложения (Python, JS, CSS, Templates).
*   `markdown_docs/` — Папка, где хранится ваша документация в формате `.md`.
*   `.gitignore` — Настроен на экспорт только ядра приложения.

