import { ui } from '../ui.js';
import { t } from '../i18n.js';

export async function renderStats() {
    const container = document.getElementById('tab-stats');
    if (!container || container.classList.contains('hidden')) return;

    const dropdown = document.getElementById('stats-limit-dropdown');
    const trigger = dropdown ? dropdown.querySelector('.dropdown-trigger') : null;
    const menu = dropdown ? dropdown.querySelector('.dropdown-menu') : null;
    const limitText = document.getElementById('stats-limit-text');
    
    let limit = 10;
    const activeItem = dropdown ? dropdown.querySelector('.dropdown-item.active') : null;
    if (activeItem) limit = activeItem.getAttribute('data-value');

    // Add listeners once
    if (dropdown && !dropdown.dataset.listener) {
        import('../components/dropdown.js').then(module => {
            module.initDropdown('stats-limit-dropdown', {
                onChange: () => {
                    renderStats(); // Re-fetch with new limit
                }
            });
        });
        dropdown.dataset.listener = 'true';
    }

    try {
        const res = await fetch(`/api/system/stats?top=${limit}`);
        if (!res.ok) throw new Error('Failed to fetch stats');
        
        const data = await res.json();
        
        renderChart(data.daily);
        renderTopDocs(data.top_docs);
        
        const totalVisits = data.daily.reduce((sum, d) => sum + d.visits, 0);
        const totalViews = data.daily.reduce((sum, d) => sum + d.views, 0);
        
        document.getElementById('stats-total-visits').textContent = totalVisits.toLocaleString();
        document.getElementById('stats-total-views').textContent = totalViews.toLocaleString();

    } catch (err) {
        console.error('Stats error:', err);
    }
}

function renderChart(daily) {
    const chart = document.getElementById('stats-daily-chart');
    if (!chart) return;
    
    chart.innerHTML = '';
    if (!daily || daily.length === 0) {
        chart.innerHTML = '<div style="width: 100%; text-align: center; opacity: 0.5;">No data available</div>';
        return;
    }

    const maxVal = Math.max(...daily.map(d => Math.max(d.visits, d.views)), 1);
    const reversed = [...daily].reverse(); 

    reversed.forEach(day => {
        const col = document.createElement('div');
        col.className = 'stats-bar-col';
        col.setAttribute('data-tooltip', `${day.date}: ${day.visits} ${t('stats_visits') || 'visits'}, ${day.views} ${t('stats_views') || 'views'}`);
        
        // Group container for the two bars side-by-side
        const barsGroup = document.createElement('div');
        barsGroup.className = 'stats-bars-group';
        
        const visitBar = document.createElement('div');
        visitBar.className = 'stats-bar-inner visit-bar';
        visitBar.style.height = `${(day.visits / maxVal) * 100}%`;

        const viewBar = document.createElement('div');
        viewBar.className = 'stats-bar-inner view-bar';
        viewBar.style.height = `${(day.views / maxVal) * 100}%`;

        barsGroup.appendChild(visitBar);
        barsGroup.appendChild(viewBar);
        col.appendChild(barsGroup);

        // Date label below
        const dateLabel = document.createElement('div');
        dateLabel.className = 'stats-date-label';
        dateLabel.textContent = day.date.split('-').slice(1).join('.'); // MM.DD
        col.appendChild(dateLabel);

        chart.appendChild(col);
    });
}

function renderTopDocs(docs) {
    const container = document.getElementById('stats-top-docs-table-container');
    if (!container) return;

    if (!docs || docs.length === 0) {
        container.innerHTML = '<div style="padding: 20px; text-align: center; opacity: 0.5;">No document stats yet</div>';
        return;
    }

    let html = `
        <table>
            <thead>
                <tr>
                    <th data-t="stats_th_path">${t('stats_th_path') || 'File Path'}</th>
                    <th style="text-align: center;" data-t="stats_th_views">${t('stats_th_views') || 'Views'}</th>
                    <th style="text-align: right;" data-t="stats_th_last_view">${t('stats_th_last_view') || 'Last View'}</th>
                </tr>
            </thead>
            <tbody>
    `;

    docs.forEach(doc => {
        html += `
            <tr>
                <td class="doc-path-cell">${doc.path}</td>
                <td class="doc-views-cell" style="text-align: center;">${doc.views}</td>
                <td style="text-align: right; opacity: 0.7; font-size: 11px;">${doc.last_viewed || '-'}</td>
            </tr>
        `;
    });

    html += '</tbody></table>';
    container.innerHTML = html;
}
