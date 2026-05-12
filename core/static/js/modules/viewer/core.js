import { ui, state } from '../ui.js';
import { API } from '../api.js';
import { t } from '../i18n.js';

export function updateURL(path, pushState, hash = null) {
    if (!pushState) return;
    const url = new URL(window.location);
    
    const homePath = state.homePagePath || "system/home.md";
    if (path === homePath) {
        url.searchParams.delete('p');
    } else {
        // Create "pretty" path for URL if it's a flattened repo
        let displayPath = path;
        const parts = path.split('/');
        if (parts.length > 0 && state.flattenedSlugs.includes(parts[0])) {
            displayPath = parts.slice(1).join('/');
        }
        
        if (displayPath) url.searchParams.set('p', displayPath);
        else url.searchParams.delete('p');
    }
    
    if (hash) url.hash = hash;
    window.history.pushState({ path }, '', url);
}

export function renderErrorPage(status, path) {
    ui.contentViewer.classList.remove('fade-out');
    const config = {
        403: { 
            title: t("error_access_denied"), 
            msg: t("error_access_denied_msg"), 
            icon: "shield-off", 
            actions: `<button id="error-btn-login" class="error-btn error-btn-primary"><i data-lucide="log-in"></i> ${t("btn_signin")}</button>` 
        },
        404: { 
            title: t("error_not_found"), 
            msg: t("error_not_found_msg"), 
            icon: "file-question", 
            actions: '' 
        }
    }[status] || { title: t("error_generic"), msg: t("error_generic"), icon: "alert-circle", actions: '' };

    const retryBtn = `<button id="error-btn-retry" class="error-btn error-btn-primary"><i data-lucide="refresh-cw"></i> ${t("btn_retry")}</button>`;
    
    ui.contentViewer.innerHTML = `
        <div class="error-page-container">
            <div class="error-icon-wrapper"><i data-lucide="${config.icon}"></i></div>
            <div class="error-code">${status}</div>
            <div class="error-title">${config.title}</div>
            <div class="error-message">${config.msg}</div>
            <div class="error-actions">${config.actions || retryBtn}</div>
        </div>`;
    
    // Add Event Listeners (CSP Friendly)
    const btnLogin = document.getElementById('error-btn-login');
    const btnRetry = document.getElementById('error-btn-retry');
    
    if (btnLogin) {
        btnLogin.onclick = () => {
            const loginTrigger = document.getElementById('btn-login-trigger');
            if (loginTrigger) loginTrigger.click();
        };
    }
    if (btnRetry) {
        btnRetry.onclick = () => location.reload();
    }

    if (window.lucide) lucide.createIcons();
}
