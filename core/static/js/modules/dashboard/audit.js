import { API } from '../api.js';
import { ui } from '../ui.js';
import { toast } from '../toasts.js';
import { escapeHTML } from '../security.js';
import { t, getLang } from '../i18n.js';

export async function initAuditTab() {
    const container = document.getElementById('audit-logs-container');
    if (!container) return;

    // Loading state
    container.innerHTML = `<div style="padding: 40px; text-align: center;"><div class="spinner-small" style="margin: 0 auto;"></div></div>`;

    try {
        const response = await fetch(API.AUDIT_LOGS);
        if (!response.ok) throw new Error('Failed to fetch logs');
        
        const logs = await response.json();
        renderLogs(container, logs);
    } catch (err) {
        container.innerHTML = `<div style="padding: 20px; text-align: center; color: var(--danger-color);">${err.message}</div>`;
        toast.error('Error loading audit logs');
    }
}

function renderLogs(container, logs) {
    if (!logs || logs.length === 0) {
        container.innerHTML = `<div style="padding: 40px; text-align: center; color: var(--text-muted);">${t('logs_empty') || 'No audit logs found.'}</div>`;
        return;
    }

    const locale = getLang() === 'ru' ? 'ru-RU' : 'en-US';

    const rows = logs.map(log => {
        const ts = log.timestamp.includes('Z') ? log.timestamp : log.timestamp + 'Z';
        const date = new Date(ts).toLocaleString(locale);
        
        return `
            <tr>
                <td style="white-space: nowrap; font-size: 11px;">${date}</td>
                <td style="white-space: nowrap;"><span style="font-weight: 600;">${escapeHTML(log.username)}</span></td>
                <td style="white-space: nowrap;"><span class="tag tag-sm" style="background: rgba(var(--primary-rgb), 0.1); color: var(--primary-color); padding: 2px 8px; border-radius: 4px; font-size: 11px;">${escapeHTML(log.action)}</span></td>
                <td style="white-space: nowrap; font-size: 11px; color: var(--text-muted); font-family: monospace;">${escapeHTML(log.ip_address || '-')}</td>
                <td style="font-size: 11px; opacity: 0.8;" title="${escapeHTML(log.details || '')}">${escapeHTML(log.details || '-')}</td>
            </tr>
        `;
    }).join('');

    container.innerHTML = `
        <table class="admin-table">
            <thead>
                <tr>
                    <th style="white-space: nowrap;" data-t="logs_th_time">${t('logs_th_time') || 'Time'}</th>
                    <th style="white-space: nowrap;" data-t="logs_th_user">${t('logs_th_user') || 'User'}</th>
                    <th style="white-space: nowrap;" data-t="logs_th_action">${t('logs_th_action') || 'Action'}</th>
                    <th style="white-space: nowrap;" data-t="logs_th_ip">${t('logs_th_ip') || 'IP'}</th>
                    <th data-t="logs_th_details">${t('logs_th_details') || 'Details'}</th>
                </tr>
            </thead>
            <tbody>
                ${rows}
            </tbody>
        </table>
    `;
}
