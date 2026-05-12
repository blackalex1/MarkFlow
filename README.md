# 🌊 MarkFlow

**MarkFlow** — a high-performance, secure, and beautiful documentation engine. It combines the flexibility of Markdown with Git-based synchronization and a premium Notion-like interface.

**MarkFlow** — это высокопроизводительный, безопасный и красивый движок для документации. Сочетает в себе гибкость Markdown, синхронизацию через Git и премиальный интерфейс в стиле Notion.

---

## 📸 Screenshots

*(Screenshots coming soon...)*

---

## ✨ Features / Возможности

*   **🔎 Smart Search**: Instant search with snippet centering and Markdown cleaning.
*   **⚡ Performance**: Built-in metadata caching and SQLite WAL mode for maximum speed.
*   **🔄 Git Sync**: Automatic incremental synchronization with remote repositories.
*   **📝 Markdown+**: Support for Mermaid diagrams, KaTeX formulas, and custom callouts.
*   **🔐 Security**: RBAC roles, 2FA (TOTP), and SSRF/CSP protection.

---

## 🐳 Deployment (Docker) / Развертывание

The easiest way to start MarkFlow is using Docker Compose.

Самый простой способ запустить MarkFlow — использовать Docker Compose.

```bash
# Clone the repository
git clone https://github.com/blackalex1/MarkFlow.git
cd MarkFlow

# Start using Docker Compose
docker-compose -f deploy/docker-compose.yml up -d
```

The application will be available at `http://localhost:8000`.
Приложение будет доступно по адресу `http://localhost:8000`.

---

## 📦 Manual Setup / Ручная установка

1.  **Install dependencies:** `pip install -r requirements.txt`
2.  **Run the server:** `uvicorn core.main:app --reload`
3.  **Login:** `admin` / `admin`

---

**MarkFlow** — built for those who value aesthetics and functionality.
Создано для тех, кто ценит эстетику и функциональность.
