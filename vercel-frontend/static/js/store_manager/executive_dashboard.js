'use strict';

const token = localStorage.getItem('access_token');
if (!token) window.location.href = '/login';

// Executive Dashboard is accessible to any authenticated role that can reach
// this page (e.g. 'admin' or 'executive') — access itself is already gated
// by the JWT check above, this just personalizes the header.
const ROLE_LABELS = { admin: 'Administrator', executive: 'Executive' };
const role = (localStorage.getItem('role') || '').toLowerCase();
const roleLabel = ROLE_LABELS[role] || (localStorage.getItem('role') ? localStorage.getItem('role') : 'Executive');

const $ = (id) => document.getElementById(id);

const escapeHtml = (text) => String(text ?? '').replace(/[&<>'"]/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[character]));
const numberOrNull = (value) => value === null || value === undefined || value === '' || !Number.isFinite(Number(value)) ? null : Number(value);
const fmt = (number, suffix = '') => {
    const value = numberOrNull(number);
    return value === null ? 'No data available' : `${value.toFixed(1)}${suffix}`;
};

let behaviorChart = null;
let executiveHeatmapState = null;

function setStatus(message, failed = false) {
    const status = $('liveStatus');
    status.textContent = message;
    status.className = `rounded-full border px-3 py-2 text-xs font-semibold ${failed ? 'border-rose-100 bg-rose-50 text-rose-700' : 'border-emerald-100 bg-emerald-50 text-emerald-700'}`;
}

function logoutAndRedirect() {
    localStorage.removeItem('access_token');
    localStorage.removeItem('full_name');
    localStorage.removeItem('role');
    document.cookie = 'access_token=; Max-Age=0; Path=/; SameSite=Lax';
    window.location.href = '/login';
}

function renderRoleBadge() {
    const status = $('liveStatus');
    if (!status || !status.parentElement || $('roleBadge')) return;
    const badge = document.createElement('span');
    badge.id = 'roleBadge';
    badge.className = 'rounded-full bg-slate-900 px-4 py-2 text-sm font-medium text-white shadow-md';
    badge.textContent = roleLabel;
    status.parentElement.insertBefore(badge, status);
}

async function request(url) {
    const requestUrl = url.startsWith("/") ? `${window.API_BASE_URL}${url}` : url;
    const response = await fetch(requestUrl, { headers: { Authorization: `Bearer ${token}` } });
    if (response.status === 401) {
        logoutAndRedirect();
        throw new Error('Session expired');
    }
    if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        const error = new Error(body.detail || `Request failed (${response.status})`);
        error.status = response.status;
        throw error;
    }
    return response.json();
}

// ---- KPI overview ----

function comparisonByName(comparison, name) {
    return (Array.isArray(comparison) ? comparison : []).find((item) => item?.name === name) || null;
}

function renderKpis(summary, intelligence, comparison) {
    const shoppers = intelligence?.customer_count ?? summary?.todays_visitors;
    const currentPeriodRevisit = comparisonByName(comparison, 'Revisit')?.current;
    $('observedShoppers').textContent = numberOrNull(shoppers) === null ? 'No data available' : numberOrNull(shoppers).toLocaleString();
    $('averageAttention').textContent = fmt(intelligence?.average_attention ?? summary.avg_attention_score, '%');
    $('averageDwell').textContent = fmt(intelligence?.average_dwell ?? summary.avg_dwell_time_mins, ' s');
    $('revisitRate').textContent = currentPeriodRevisit ?? (intelligence ? fmt(intelligence.revisit_rate, '%') : 'No data available');
    $('highInterestRate').textContent = intelligence ? fmt(intelligence.high_interest_rate, '%') : 'No data available';
    $('quickPassRate').textContent = intelligence ? fmt(intelligence.quick_pass_rate, '%') : 'No data available';
}

// ---- Performance vs previous period ----

function renderChangeCell(elementId, change) {
    const cell = $(elementId);
    if (!Number.isFinite(change)) {
        cell.textContent = 'No data available';
        cell.className = 'px-5 py-4 text-right text-slate-400';
        return;
    }
    const isUp = change > 0;
    const isFlat = change === 0;
    cell.textContent = `${isFlat ? '' : isUp ? '▲ ' : '▼ '}${Math.abs(change).toFixed(1)}%`;
    cell.className = `px-5 py-4 text-right font-semibold ${isFlat ? 'text-slate-500' : isUp ? 'text-emerald-600' : 'text-rose-600'}`;
}

function renderComparison(comparison) {
    const byName = new Map((Array.isArray(comparison) ? comparison : []).map((item) => [item.name, item]));
    const rows = [
        { name: 'Attention', ids: ['attentionCurrent', 'attentionPrevious', 'attentionChange'] },
        { name: 'Dwell', ids: ['dwellCurrent', 'dwellPrevious', 'dwellChange'] },
        { name: 'Revisit', ids: ['revisitCurrent', 'revisitPrevious', 'revisitChange'] },
    ];

    rows.forEach(({ name, ids }) => {
        const [currentId, previousId, changeId] = ids;
        const metric = byName.get(name);
        $(currentId).textContent = metric?.current ?? 'No data available';
        $(previousId).textContent = metric?.previous ?? 'No data available';
        renderChangeCell(changeId, numberOrNull(metric?.change));
    });
}

// ---- Shopper behavior ----

function renderBehaviorChart(behavior) {
    const canvas = $('behaviorChart');
    const empty = $('behaviorEmpty');
    const entries = [['Quick Pass', behavior?.quick_pass], ['Browsing', behavior?.browsing], ['High Interest', behavior?.high_interest], ['Revisit', behavior?.revisit]]
        .filter(([, metric]) => Number.isFinite(Number(metric)));

    if (behaviorChart) { behaviorChart.destroy(); behaviorChart = null; }

    if (!entries.length) {
        canvas.classList.add('hidden');
        empty.classList.remove('hidden');
        return;
    }
    canvas.classList.remove('hidden');
    empty.classList.add('hidden');

    behaviorChart = new Chart(canvas.getContext('2d'), {
        type: 'doughnut',
        data: {
            labels: entries.map(([label]) => label),
            datasets: [{
                data: entries.map(([, metric]) => Number(metric)),
                backgroundColor: ['#60a5fa', '#818cf8', '#34d399', '#fbbf24'],
                borderWidth: 0,
            }],
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { position: 'right', labels: { boxWidth: 10, font: { size: 11 } } },
                tooltip: { callbacks: { label: (context) => `${context.label}: ${Number(context.parsed).toFixed(1)}%` } },
            },
        },
    });
}

// ---- Store attention heatmap ----

function heatColor(value, maximum) {
    const ratio = maximum > 0 ? Math.max(0, Math.min(1, value / maximum)) : 0;
    const start = ratio < 0.5 ? [14, 165, 180] : [251, 191, 36];
    const end = ratio < 0.5 ? [251, 191, 36] : [244, 63, 94];
    const progress = ratio < 0.5 ? ratio * 2 : (ratio - 0.5) * 2;
    const color = start.map((channel, index) => Math.round(channel + (end[index] - channel) * progress));
    return `rgba(${color.join(',')}, .72)`;
}

function validRoiPoints(points) {
    return Array.isArray(points) && points.length >= 3 && points.every((point) => Number.isFinite(Number(point?.x)) && Number.isFinite(Number(point?.y)));
}

function attentionAreas(spatial, live) {
    const shelfAttention = new Map((live?.shelf_intelligence || [])
        .filter((item) => numberOrNull(item?.attention) !== null)
        .map((item) => [item.name, numberOrNull(item.attention)]));
    const zoneAttention = new Map((live?.zone_intelligence || [])
        .filter((item) => numberOrNull(item?.attention) !== null)
        .map((item) => [item.name, numberOrNull(item.attention)]));
    const shelves = spatial?.areas?.shelves || [];
    const zones = spatial?.areas?.zones || [];
    return [...shelves, ...zones].map((area) => ({
        name: area?.name,
        points: area?.points,
        attention: shelfAttention.get(area?.name) ?? zoneAttention.get(area?.name),
    })).filter((area) => area.name && validRoiPoints(area.points) && area.attention !== null && area.attention !== undefined);
}

function renderExecutiveHeatmap(spatial, live) {
    const canvas = $('executiveHeatmap');
    const empty = $('executiveHeatmapEmpty');
    if (!canvas || !empty) return;
    const areas = attentionAreas(spatial, live);
    const camera = spatial?.cameras?.[0];
    if (!areas.length || !camera) {
        canvas.classList.add('hidden');
        empty.classList.remove('hidden');
        executiveHeatmapState = null;
        return;
    }

    const rect = canvas.getBoundingClientRect();
    const pixelRatio = window.devicePixelRatio || 1;
    const fallbackWidth = Math.max(...areas.flatMap((area) => area.points.map((point) => Number(point.x))), 1);
    const fallbackHeight = Math.max(...areas.flatMap((area) => area.points.map((point) => Number(point.y))), 1);
    const width = numberOrNull(camera.blueprint_width) || fallbackWidth;
    const height = numberOrNull(camera.blueprint_height) || fallbackHeight;
    if (!rect.width || !rect.height || !width || !height) {
        canvas.classList.add('hidden');
        empty.classList.remove('hidden');
        return;
    }

    canvas.width = Math.floor(rect.width * pixelRatio);
    canvas.height = Math.floor(rect.height * pixelRatio);
    const context = canvas.getContext('2d');
    context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
    context.clearRect(0, 0, rect.width, rect.height);
    const toCanvas = (point) => ({ x: (Number(point.x) / width) * rect.width, y: (Number(point.y) / height) * rect.height });
    const maximum = Math.max(...areas.map((area) => area.attention), 1);

    areas.forEach((area) => {
        const polygon = area.points.map(toCanvas);
        context.beginPath();
        polygon.forEach((point, index) => index ? context.lineTo(point.x, point.y) : context.moveTo(point.x, point.y));
        context.closePath();
        context.fillStyle = heatColor(area.attention, maximum);
        context.fill();
        context.strokeStyle = 'rgba(226, 232, 240, .9)';
        context.lineWidth = 1.5;
        context.stroke();
        const center = polygon.reduce((sum, point) => ({ x: sum.x + point.x / polygon.length, y: sum.y + point.y / polygon.length }), { x: 0, y: 0 });
        const label = `${area.name}: ${area.attention.toFixed(1)}%`;
        context.font = '600 12px sans-serif';
        const labelWidth = context.measureText(label).width;
        context.fillStyle = 'rgba(15, 23, 42, .82)';
        context.fillRect(center.x - labelWidth / 2 - 5, center.y - 11, labelWidth + 10, 22);
        context.fillStyle = '#f8fafc';
        context.fillText(label, center.x - labelWidth / 2, center.y + 4);
    });
    canvas.classList.remove('hidden');
    empty.classList.add('hidden');
    executiveHeatmapState = { spatial, live };
}

async function loadExecutiveHeatmap(live) {
    try {
        const index = await request('/api/production/heatmaps/spatial');
        const camera = index?.cameras?.[0];
        if (!camera?.id) {
            renderExecutiveHeatmap(null, live);
            return;
        }
        const spatial = await request(`/api/production/heatmaps/spatial?camera_id=${encodeURIComponent(camera.id)}`);
        renderExecutiveHeatmap(spatial, live);
    } catch (error) {
        // Spatial access/data is optional; do not prevent executive analytics from rendering.
        console.info('Executive spatial heatmap unavailable:', error.message);
        renderExecutiveHeatmap(null, live);
    }
}

// ---- Peak activity ----

function extractPeak(history, summary) {
    const period = history?.peak_period;
    if (period?.peak) return { label: period.peak, sub: null };
    if (summary?.peak_shopping_hour !== null && summary?.peak_shopping_hour !== undefined) return { label: summary.peak_shopping_hour, sub: null };
    return null;
}

function renderPeakActivity(peak) {
    if (!peak) {
        $('peakActivity').textContent = 'No data available';
        $('peakActivityLabel').textContent = 'Highest observed shopper activity';
        return;
    }
    $('peakActivity').textContent = peak.label;
    $('peakActivityLabel').textContent = peak.sub ? `Highest observed shopper activity (${peak.sub})` : 'Highest observed shopper activity';
}

// ---- Period info / last updated ----

function renderPeriod(base) {
    const period = base?.summary?.period ?? base?.summary?.date_range ?? base?.period ?? null;
    const element = $('periodInfo');
    if (period) {
        element.textContent = typeof period === 'string' ? period : JSON.stringify(period);
        element.classList.remove('hidden');
    } else {
        element.classList.add('hidden');
    }
}

// ---- Shelves ----

function shelfRow(shelf) {
    return `<tr>
        <td class="px-5 py-4 font-semibold text-slate-900">${escapeHtml(shelf.shelf_id ?? shelf.name ?? 'Unassigned')}</td>
        <td class="px-5 py-4 text-right">${fmt(shelf.attention, '%')}</td>
        <td class="px-5 py-4 text-right">${fmt(shelf.average_dwell, ' s')}</td>
        <td class="px-5 py-4 text-right">${Number(shelf.attention || 0) >= 70 ? 'Yes' : 'No'}</td>
    </tr>`;
}

function renderShelves(shelves) {
    const valid = (Array.isArray(shelves) ? shelves : []).filter((shelf) => Number.isFinite(Number(shelf.attention)));
    if (!valid.length) {
        $('topShelves').innerHTML = '<tr><td colspan="4" class="px-5 py-8 text-center text-slate-400">No data available</td></tr>';
        $('bottomShelves').innerHTML = '<tr><td colspan="4" class="px-5 py-8 text-center text-slate-400">No data available</td></tr>';
        return;
    }
    const sortedDesc = [...valid].sort((a, b) => Number(b.attention) - Number(a.attention));
    const top = sortedDesc.slice(0, 3);
    const bottom = sortedDesc.slice(-3).reverse();

    $('topShelves').innerHTML = top.map(shelfRow).join('');
    $('bottomShelves').innerHTML = bottom.map(shelfRow).join('');
}

// ---- Top 3 products ----

function renderProducts(products) {
    const ranked = (Array.isArray(products) ? products : [])
        .filter((product) => numberOrNull(product.attractiveness_score ?? product.attention) !== null)
        .sort((a, b) => numberOrNull(b.attractiveness_score ?? b.attention) - numberOrNull(a.attractiveness_score ?? a.attention))
        .slice(0, 3);

    $('topProducts').innerHTML = ranked.length
        ? ranked.map((product) => `<li class="rounded-xl bg-slate-50 p-4">
            <p class="text-sm font-semibold text-slate-900">${escapeHtml(product.product_name)}</p>
            <p class="mt-1 text-xs text-slate-500">Product ${escapeHtml(product.product_id ?? '—')} · Shelf ${escapeHtml(product.shelf_id ?? '—')}</p>
            <p class="mt-2 text-lg font-bold text-blue-700">${fmt(product.attractiveness_score ?? product.attention, product.attractiveness_score === null || product.attractiveness_score === undefined ? '% attention' : '/100')}</p>
        </li>`).join('')
        : '<li class="text-sm text-slate-400">No data available</li>';
}

// ---- Executive key insights ----

function renderInsights(baseInsights, shelves, products) {
    const insights = [];

    if (Array.isArray(baseInsights)) baseInsights.filter(Boolean).forEach((message) => insights.push(message));

    const validShelves = (Array.isArray(shelves) ? shelves : []).filter((shelf) => Number.isFinite(Number(shelf.attention)));
    if (validShelves.length) {
        const top = [...validShelves].sort((a, b) => Number(b.attention) - Number(a.attention))[0];
        insights.push(`${top.shelf_id ?? top.name ?? 'A shelf'} is the highest-attention shelf at ${Number(top.attention).toFixed(1)}%.`);

        const dwellValues = validShelves.map((shelf) => Number(shelf.average_dwell)).filter((dwell) => Number.isFinite(dwell));
        if (dwellValues.length > 1) {
            const mean = dwellValues.reduce((sum, dwell) => sum + dwell, 0) / dwellValues.length;
            const outlier = validShelves.find((shelf) => Number.isFinite(Number(shelf.average_dwell)) && Math.abs(Number(shelf.average_dwell) - mean) > mean * 0.5);
            if (outlier) insights.push(`${outlier.shelf_id ?? outlier.name ?? 'A shelf'} shows unusually high dwell time relative to the store average.`);
        }
    }

    const validProducts = (Array.isArray(products) ? products : []).filter((product) => Number.isFinite(Number(product.attractiveness_score)));
    if (validProducts.length) {
        const top = [...validProducts].sort((a, b) => b.attractiveness_score - a.attractiveness_score)[0];
        insights.push(`${top.product_name} shows the highest observed attractiveness score at ${Number(top.attractiveness_score).toFixed(1)}.`);
    }

    const unique = [...new Set(insights)].slice(0, 5);
    $('executiveInsights').innerHTML = unique.length
        ? unique.map((message) => `<li class="border-l-2 border-blue-200 pl-3">${escapeHtml(message)}</li>`).join('')
        : '<li class="text-slate-400">No data available</li>';
}

// ---- Priority actions ----

function renderPriorityActions(shelves, products) {
    const actions = [];

    const validShelves = (Array.isArray(shelves) ? shelves : []).filter((shelf) => Number.isFinite(Number(shelf.attention)));
    if (validShelves.length) {
        const lowest = [...validShelves].sort((a, b) => Number(a.attention) - Number(b.attention))[0];
        actions.push({
            level: 'High Priority',
            color: 'border-rose-200 bg-rose-50 text-rose-700',
            text: `Investigate ${lowest.shelf_id ?? lowest.name ?? 'this shelf'} — lowest observed attention at ${Number(lowest.attention).toFixed(1)}%.`,
        });

        const dwellValues = validShelves.map((shelf) => Number(shelf.average_dwell)).filter((dwell) => Number.isFinite(dwell));
        if (dwellValues.length > 1) {
            const mean = dwellValues.reduce((sum, dwell) => sum + dwell, 0) / dwellValues.length;
            const outlier = validShelves.find((shelf) => Number.isFinite(Number(shelf.average_dwell)) && Math.abs(Number(shelf.average_dwell) - mean) > mean * 0.5);
            if (outlier) {
                actions.push({
                    level: 'Medium Priority',
                    color: 'border-amber-200 bg-amber-50 text-amber-700',
                    text: `Review ${outlier.shelf_id ?? outlier.name ?? 'this shelf'} — dwell time is significantly above the store average.`,
                });
            }
        }
    }

    const validProducts = (Array.isArray(products) ? products : []).filter((product) => Number.isFinite(Number(product.attractiveness_score)));
    if (validProducts.length) {
        const top = [...validProducts].sort((a, b) => b.attractiveness_score - a.attractiveness_score)[0];
        actions.push({
            level: 'Opportunity',
            color: 'border-emerald-200 bg-emerald-50 text-emerald-700',
            text: `Monitor ${top.product_name} — strongest observed attractiveness score at ${Number(top.attractiveness_score).toFixed(1)}.`,
        });
    }

    $('priorityActions').innerHTML = actions.length
        ? actions.map((action) => `<div class="rounded-xl border p-3 ${action.color}">
            <p class="text-xs font-bold uppercase tracking-wide">${action.level}</p>
            <p class="mt-1 text-sm font-medium">${escapeHtml(action.text)}</p>
        </div>`).join('')
        : '<p class="text-sm text-slate-400">No data available</p>';
}

// ---- Load ----

function renderUnavailableDashboard() {
    renderKpis({}, null);
    renderComparison(null);
    renderBehaviorChart(null);
    renderPeakActivity(null);
    renderShelves([]);
    renderProducts([]);
    renderInsights([], [], []);
    renderPriorityActions([], []);
    renderExecutiveHeatmap(null, null);
    $('lastUpdated').textContent = 'No data available';
}

async function loadDashboard() {
    setStatus('Loading executive analytics…');

    let base = null;
    let live = null;
    let history = null;
    let baseError = null;
    let liveError = null;

    try {
        base = await request('/api/dashboard/live');
    } catch (error) {
        if (error.message === 'Session expired') return;
        baseError = error;
    }

    try {
        live = await request('/api/production/analytics/live');
    } catch (error) {
        if (error.message === 'Session expired') return;
        liveError = error;
        console.error(`Executive analytics detail unavailable for role "${roleLabel}":`, error);
    }

    try {
        history = await request('/api/production/analytics/retail-intelligence?days=7');
    } catch (error) {
        if (error.message === 'Session expired') return;
        console.error(`Executive analytics history unavailable for role "${roleLabel}":`, error);
    }

    if (!base && !live) {
        setStatus('Unable to load executive analytics.', true);
        renderUnavailableDashboard();
        return;
    }
    if (baseError) {
        console.info(`Dashboard summary unavailable for role "${roleLabel}":`, baseError.message);
    }

    const summary = base?.summary || live?.summary || {};
    const intelligence = live?.consumer_intelligence || null;
    const shelves = live?.shelf_intelligence || base?.series?.shelf_performance || [];
    const products = live?.product_attractiveness || base?.series?.product_performance || [];
    const peak = extractPeak(history, summary);

    renderPeriod(base);
    renderKpis(summary, intelligence, history?.comparison);
    renderComparison(history?.comparison);
    renderBehaviorChart(live?.behavior_distribution);
    renderPeakActivity(peak);
    renderShelves(shelves);
    renderProducts(products);
    renderInsights(live?.key_insights, shelves, products);
    renderPriorityActions(shelves, products);
    await loadExecutiveHeatmap(live);

    $('lastUpdated').textContent = `Last updated ${new Date().toLocaleTimeString()}`;
    setStatus(live && history ? 'Live' : 'Core analytics loaded; detailed metrics are unavailable for this account.');
}

document.addEventListener('DOMContentLoaded', () => {
    renderRoleBadge();
    $('logoutBtn').addEventListener('click', logoutAndRedirect);
    loadDashboard().catch((error) => {
        console.error('Executive Dashboard:', error);
        setStatus(error.message || 'Unable to load executive analytics.', true);
    });
    window.addEventListener('resize', () => {
        if (executiveHeatmapState) renderExecutiveHeatmap(executiveHeatmapState.spatial, executiveHeatmapState.live);
    });
});
