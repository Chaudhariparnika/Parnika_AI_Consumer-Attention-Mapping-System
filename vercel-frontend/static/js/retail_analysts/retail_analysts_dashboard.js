'use strict';

// Renders existing authenticated API responses only; no client-side analytics are invented.
const token = localStorage.getItem('access_token');
const $ = (id) => document.getElementById(id);
let behaviorChart = null;
let trendChart = null;

class ApiError extends Error {
    constructor(status, message) {
        super(message);
        this.status = status;
    }
}

function n(value) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
}

function metric(value, suffix) {
    const parsed = n(value);
    return parsed === null ? 'No data available' : parsed.toFixed(1) + (suffix || '');
}

function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>'"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[c]));
}

function setText(id, value) {
    const element = $(id);
    if (element) element.textContent = value;
}

function setHtml(id, value) {
    const element = $(id);
    if (element) element.innerHTML = value;
}

function setStatus(message, failed) {
    const status = $('liveStatus');
    if (!status) return;
    status.textContent = message;
    status.className = 'rounded-full border px-3 py-2 text-xs font-semibold ' + (failed
        ? 'border-rose-100 bg-rose-50 text-rose-700'
        : 'border-emerald-100 bg-emerald-50 text-emerald-700');
}

function loginAgain() {
    localStorage.removeItem('access_token');
    localStorage.removeItem('full_name');
    localStorage.removeItem('role');
    document.cookie = 'access_token=; Max-Age=0; Path=/; SameSite=Lax';
    window.location.assign('/login');
}

async function request(url) {
    const requestUrl = url.startsWith('/') ? `${window.API_BASE_URL}${url}` : url;
    const response = await fetch(requestUrl, { headers: { Authorization: 'Bearer ' + token, Accept: 'application/json' } });
    if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw new ApiError(response.status, body.detail || 'Request failed (' + response.status + ')');
    }
    return response.json();
}

async function optionalRequest(url) {
    try {
        return { data: await request(url), error: null };
    } catch (error) {
        if (error instanceof ApiError && error.status === 401) throw error;
        console.info('Retail Analyst dashboard could not load ' + url + ':', error.message);
        return { data: null, error };
    }
}

function renderKpis(base, live, shelves) {
    const summary = base?.summary || {};
    const intelligence = live?.consumer_intelligence;
    const shoppers = intelligence?.customer_count ?? summary.todays_visitors;
    const activeShelves = (shelves || []).filter((item) => n(item.visitors) !== null && n(item.visitors) > 0).length;

    setText('observedShoppers', n(shoppers) === null ? 'No data available' : n(shoppers).toLocaleString());
    setText('averageAttention', metric(intelligence?.average_attention ?? summary.avg_attention_score, '%'));
    setText('averageDwell', metric(intelligence?.average_dwell ?? summary.avg_dwell_time_mins, ' s'));
    setText('revisitRate', metric(intelligence?.revisit_rate, '%'));
    setText('activeShelves', activeShelves ? activeShelves.toLocaleString() : 'No data available');
    // The existing live response publishes high-interest as a rate.
    // Render that exact field rather than estimating a count client-side.
    setText('highInterestCount', metric(intelligence?.high_interest_rate, '%'));
}

function renderBehaviorChart(behavior) {
    const canvas = $('behaviorChart');
    const empty = $('behaviorEmpty');
    if (!canvas || !empty) return;
    const entries = [['Quick Pass', behavior?.quick_pass], ['Browsing', behavior?.browsing], ['High Interest', behavior?.high_interest], ['Revisit', behavior?.revisit]]
        .filter((item) => n(item[1]) !== null);
    if (behaviorChart) behaviorChart.destroy();
    behaviorChart = null;
    if (!entries.length || typeof Chart === 'undefined') {
        canvas.classList.add('hidden');
        empty.classList.remove('hidden');
        return;
    }
    canvas.classList.remove('hidden');
    empty.classList.add('hidden');
    behaviorChart = new Chart(canvas.getContext('2d'), {
        type: 'doughnut',
        data: { labels: entries.map((item) => item[0]), datasets: [{ data: entries.map((item) => n(item[1])), backgroundColor: ['#60a5fa', '#818cf8', '#34d399', '#fbbf24'], borderWidth: 0 }] },
        options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'bottom', labels: { boxWidth: 10, font: { size: 11 } } }, tooltip: { callbacks: { label: (context) => context.label + ': ' + n(context.parsed).toFixed(1) + '%' } } } },
    });
}

function renderTrendChart(history) {
    const canvas = $('trendChart');
    const empty = $('trendEmpty');
    if (!canvas || !empty) return [];
    const attention = history?.trend?.attention;
    const points = (attention?.labels || []).map((label, index) => ({ label, value: n(attention.values?.[index]) })).filter((item) => item.value !== null);
    if (trendChart) trendChart.destroy();
    trendChart = null;
    if (!points.length || typeof Chart === 'undefined') {
        canvas.classList.add('hidden');
        empty.classList.remove('hidden');
        return [];
    }
    canvas.classList.remove('hidden');
    empty.classList.add('hidden');
    trendChart = new Chart(canvas.getContext('2d'), {
        type: 'line',
        data: { labels: points.map((item) => item.label), datasets: [{ label: 'Average Attention (%)', data: points.map((item) => item.value), borderColor: '#2563eb', backgroundColor: 'rgba(37,99,235,.12)', fill: true, tension: .3, pointRadius: 3 }] },
        options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true, ticks: { callback: (tick) => tick + '%' } } } },
    });
    return points;
}

function renderShelves(shelves) {
    const rows = (shelves || []).slice(0, 5);
    if (!rows.length) {
        setHtml('shelfTable', '<tr><td colspan="5" class="px-5 py-8 text-center text-slate-400">No data available</td></tr>');
        return;
    }
    setHtml('shelfTable', rows.map((shelf, index) => '<tr><td class="px-5 py-4 text-slate-500">' + (index + 1) + '</td><td class="px-5 py-4 font-semibold text-slate-900">' + escapeHtml(shelf.shelf_id ?? shelf.name ?? shelf.shelf ?? 'Unassigned') + '</td><td class="px-5 py-4 text-right">' + metric(shelf.attention, '%') + '</td><td class="px-5 py-4 text-right">' + metric(shelf.average_dwell ?? shelf.dwell, ' s') + '</td><td class="px-5 py-4 text-right">' + (shelf.high_interest === true ? 'Yes' : shelf.high_interest === false ? 'No' : 'No data available') + '</td></tr>').join(''));
}

function renderProducts(liveProducts, baseProducts) {
    const products = (liveProducts?.length ? liveProducts : (baseProducts || []))
        .filter((item) => n(item.attractiveness_score ?? item.attention) !== null)
        .sort((left, right) => n(right.attractiveness_score ?? right.attention) - n(left.attractiveness_score ?? left.attention))
        .slice(0, 3);
    if (!products.length) {
        setHtml('topProducts', '<li class="text-sm text-slate-400">No data available</li>');
        return;
    }
    setHtml('topProducts', products.map((product) => {
        const score = n(product.attractiveness_score);
        const label = score === null ? metric(product.attention ?? product.average_attention, '% attention') : metric(score, '/100');
        return '<li class="flex items-center justify-between rounded-xl bg-slate-50 px-4 py-3"><div><p class="text-sm font-semibold text-slate-900">' + escapeHtml(product.product_name ?? product.name ?? 'Unassigned') + '</p><p class="text-xs text-slate-500">' + escapeHtml(product.product_id ?? product.sku ?? '—') + '</p></div><span class="text-sm font-bold text-blue-700">' + label + '</span></li>';
    }).join(''));
}

function renderSignals(live, base, trend) {
    const signals = Array.isArray(live?.key_insights) ? [...live.key_insights] : [];
    const summary = base?.summary || {};
    if (!signals.length && summary.most_viewed_shelf && summary.most_viewed_shelf !== 'No activity') signals.push(summary.most_viewed_shelf + ' is the most observed shelf today.');
    if (!signals.length && summary.peak_shopping_hour) signals.push('Peak observed shopper activity is at ' + summary.peak_shopping_hour + '.');
    if (trend.length > 1 && trend[0].value !== trend[trend.length - 1].value) signals.push('Average attention changed from ' + trend[0].value.toFixed(1) + '% to ' + trend[trend.length - 1].value.toFixed(1) + '% across the available period.');
    const unique = [...new Set(signals.filter(Boolean))].slice(0, 5);
    setHtml('keySignals', unique.length ? unique.map((item) => '<li class="border-l-2 border-blue-200 pl-3">' + escapeHtml(item) + '</li>').join('') : '<li class="text-slate-400">No data available</li>');
}

function renderPaths(paths) {
    const ranked = (paths || []).map((path) => ({ label: Array.isArray(path.path) ? path.path.join(' → ') : path.path ?? path.name ?? path.route ?? path.sequence, share: n(path.percentage ?? path.share ?? path.share_percent) }))
        .filter((item) => item.label && item.share !== null).slice(0, 3);
    setHtml('topPaths', ranked.length ? ranked.map((path, index) => '<li class="flex items-center justify-between rounded-xl bg-slate-50 px-4 py-3"><div class="flex items-center gap-3"><span class="flex h-7 w-7 items-center justify-center rounded-full bg-blue-100 text-xs font-bold text-blue-700">' + (index + 1) + '</span><span class="text-sm font-semibold text-slate-900">' + escapeHtml(path.label) + '</span></div><span class="text-sm font-bold text-blue-700">' + path.share.toFixed(1) + '%</span></li>').join('') : '<li class="text-sm text-slate-400">No data available</li>');
}

async function loadDashboard() {
    setStatus('Loading analytics…');
    const base = await request('/api/dashboard/live');
    const results = await Promise.all([optionalRequest('/api/production/analytics/live'), optionalRequest('/api/production/analytics/retail-intelligence?days=7')]);
    const liveResult = results[0];
    const historyResult = results[1];
    const live = liveResult.data;
    const shelves = live?.shelf_intelligence || base?.series?.shelf_performance || [];

    setText('welcomeText', 'Retail Analytics');
    renderKpis(base, live, shelves);
    renderBehaviorChart(live?.behavior_distribution);
    const trend = renderTrendChart(historyResult.data);
    renderShelves(shelves);
    renderProducts(live?.product_attractiveness, base?.series?.product_performance);
    renderSignals(live, base, trend);
    renderPaths(live?.common_paths);

    if (liveResult.error || historyResult.error) {
        const denied = [liveResult.error, historyResult.error].some((error) => error?.status === 403);
        setStatus(denied ? 'Core analytics loaded; some detailed metrics are unavailable for this account.' : 'Core analytics loaded; some details are temporarily unavailable.');
    } else {
        setStatus('Updated ' + new Date().toLocaleTimeString());
    }
}

document.addEventListener('DOMContentLoaded', () => {
    if (!token) {
        window.location.assign('/login');
        return;
    }
    $('logoutBtn')?.addEventListener('click', loginAgain);
    loadDashboard().catch((error) => {
        console.error('Retail Analyst Dashboard API error:', error);
        if (error instanceof ApiError && error.status === 401) {
            loginAgain();
            return;
        }
        setStatus(error.message || 'Analytics unavailable', true);
    });
});
