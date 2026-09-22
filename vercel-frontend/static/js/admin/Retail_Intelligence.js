/* ================================================================
   RETAIL INTELLIGENCE
   Historical Shopper Behavior Dashboard
================================================================ */

'use strict';


/* ================================================================
   CONFIGURATION
================================================================ */

const API_URL = `${window.API_BASE_URL}/api/production/analytics/retail-intelligence`;

const token = localStorage.getItem('access_token');


/* ================================================================
   STATE
================================================================ */

let attentionTrendChart = null;
let dwellTrendChart = null;
let peakPeriodChart = null;

let selectedPeriod = 7;


/* ================================================================
   DOM HELPER
================================================================ */

const $ = (id) => document.getElementById(id);


/* ================================================================
   NUMBER HELPERS
================================================================ */

function number(value, fallback = 0) {

    const parsed = Number(value);

    return Number.isFinite(parsed)
        ? parsed
        : fallback;
}


function formatPercent(value) {

    return `${number(value).toFixed(0)}%`;

}


function formatSeconds(value) {

    const seconds = number(value);

    if (seconds < 60) {
        return `${seconds.toFixed(0)}s`;
    }

    const minutes = Math.floor(seconds / 60);
    const remaining = Math.round(seconds % 60);

    return `${minutes}m ${remaining}s`;

}


function formatChange(value) {

    const change = number(value);

    const arrow = change > 0
        ? '↑'
        : change < 0
            ? '↓'
            : '→';

    return `${arrow} ${Math.abs(change).toFixed(0)}%`;

}


/* ================================================================
   HTML SAFETY
================================================================ */

function escapeHtml(value) {

    return String(value ?? '')
        .replace(/[&<>'"]/g, character => ({
            '&': '&amp;',
            '<': '&lt;',
            '>': '&gt;',
            "'": '&#39;',
            '"': '&quot;'
        })[character]);

}


/* ================================================================
   CHART DEFAULTS
================================================================ */

function chartDefaults() {

    return {

        responsive: true,

        maintainAspectRatio: false,

        interaction: {
            intersect: false,
            mode: 'index'
        },

        plugins: {

            legend: {
                display: false
            },

            tooltip: {

                backgroundColor: '#172033',

                padding: 10,

                titleFont: {
                    size: 11,
                    weight: '600'
                },

                bodyFont: {
                    size: 11
                },

                displayColors: false

            }

        },

        scales: {

            x: {

                grid: {
                    display: false
                },

                border: {
                    display: false
                },

                ticks: {
                    color: '#9aa1b2',
                    font: {
                        size: 10
                    }
                }

            },

            y: {

                beginAtZero: true,

                grid: {
                    color: '#eef0f4'
                },

                border: {
                    display: false
                },

                ticks: {
                    color: '#9aa1b2',
                    font: {
                        size: 10
                    }
                }

            }

        }

    };

}


/* ================================================================
   TREND CHARTS
================================================================ */

function renderAttentionTrend(data) {

    const canvas = $('attentionTrendChart');

    if (!canvas) return;

    if (attentionTrendChart) {
        attentionTrendChart.destroy();
    }

    const ctx = canvas.getContext('2d');

    attentionTrendChart = new Chart(ctx, {

        type: 'line',

        data: {

            labels: data.labels,

            datasets: [{

                data: data.values,

                tension: 0.35,

                borderWidth: 2.5,

                borderColor: '#6657d9',

                backgroundColor: 'rgba(102, 87, 217, 0.08)',

                fill: true,

                pointRadius: 3,

                pointHoverRadius: 5,

                pointBackgroundColor: '#6657d9'

            }]

        },

        options: {

            ...chartDefaults(),

            scales: {

                ...chartDefaults().scales,

                y: {

                    ...chartDefaults().scales.y,

                    min: 0,

                    max: 100,

                    ticks: {

                        ...chartDefaults().scales.y.ticks,

                        callback: value => `${value}%`

                    }

                }

            },

            plugins: {

                ...chartDefaults().plugins,

                tooltip: {

                    ...chartDefaults().plugins.tooltip,

                    callbacks: {

                        label: context =>
                            `Attention: ${number(context.raw).toFixed(1)}%`

                    }

                }

            }

        }

    });

}


function renderDwellTrend(data) {

    const canvas = $('dwellTrendChart');

    if (!canvas) return;

    if (dwellTrendChart) {
        dwellTrendChart.destroy();
    }

    const ctx = canvas.getContext('2d');

    dwellTrendChart = new Chart(ctx, {

        type: 'line',

        data: {

            labels: data.labels,

            datasets: [{

                data: data.values,

                tension: 0.35,

                borderWidth: 2.5,

                borderColor: '#44ae89',

                backgroundColor: 'rgba(68, 174, 137, 0.08)',

                fill: true,

                pointRadius: 3,

                pointHoverRadius: 5,

                pointBackgroundColor: '#44ae89'

            }]

        },

        options: {

            ...chartDefaults(),

            plugins: {

                ...chartDefaults().plugins,

                tooltip: {

                    ...chartDefaults().plugins.tooltip,

                    callbacks: {

                        label: context =>
                            `Dwell: ${formatSeconds(context.raw)}`

                    }

                }

            },

            scales: {

                ...chartDefaults().scales,

                y: {

                    ...chartDefaults().scales.y,

                    ticks: {

                        ...chartDefaults().scales.y.ticks,

                        callback: value =>
                            `${value}s`

                    }

                }

            }

        }

    });

}


/* ================================================================
   COMPARISON TABLE
================================================================ */

function renderComparisons(comparisons) {

    const table = $('comparisonTable');

    if (!table) return;

    if (!comparisons.length) {
        table.innerHTML = '<tr><td colspan="4" class="px-5 py-8 text-center text-sm text-slate-400">No historical comparison data available.</td></tr>';
        return;
    }

    table.innerHTML = comparisons.map(metric => {

        const change = number(metric.change);

        const positive = change > 0;
        const negative = change < 0;

        const colorClass =
            positive
                ? 'text-emerald-600 bg-emerald-50'
                : negative
                    ? 'text-rose-600 bg-rose-50'
                    : 'text-slate-500 bg-slate-100';

        return `

            <tr class="transition hover:bg-slate-50">

                <td class="px-5 py-4">

                    <span class="text-sm font-semibold text-slate-800">
                        ${escapeHtml(metric.name)}
                    </span>

                </td>

                <td class="px-5 py-4 text-right text-sm text-slate-500">
                    ${escapeHtml(metric.previous)}
                </td>

                <td class="px-5 py-4 text-right text-sm font-semibold text-slate-900">
                    ${escapeHtml(metric.current)}
                </td>

                <td class="px-5 py-4 text-right">

                    <span class="inline-flex rounded-full px-2.5 py-1 text-xs font-bold ${colorClass}">
                        ${formatChange(change)}
                    </span>

                </td>

            </tr>

        `;

    }).join('');

}


/* ================================================================
   SHELF RANKINGS
================================================================ */

function renderRankings(rows) {

    const table = $('rankingTable');

    if (!table) return;

    if (!rows.length) {

        table.innerHTML = `

            <tr>

                <td colspan="6"
                    class="px-5 py-8 text-center text-sm text-slate-400">

                    No historical shelf data available.

                </td>

            </tr>

        `;

        return;
    }


    table.innerHTML = rows.map((row, index) => {

        const rank = index + 1;

        let rankBadge = '';

        if (rank === 1) {

            rankBadge = `
                <span class="inline-flex h-7 w-7 items-center justify-center rounded-full bg-violet-100 text-xs font-bold text-violet-700">
                    1
                </span>
            `;

        } else if (rank === 2) {

            rankBadge = `
                <span class="inline-flex h-7 w-7 items-center justify-center rounded-full bg-slate-100 text-xs font-bold text-slate-600">
                    2
                </span>
            `;

        } else if (rank === 3) {

            rankBadge = `
                <span class="inline-flex h-7 w-7 items-center justify-center rounded-full bg-amber-50 text-xs font-bold text-amber-700">
                    3
                </span>
            `;

        } else {

            rankBadge = `
                <span class="inline-flex h-7 w-7 items-center justify-center text-xs font-semibold text-slate-400">
                    ${rank}
                </span>
            `;

        }


        const engagement = number(row.engagement);

        return `

            <tr class="transition hover:bg-slate-50">

                <td class="px-5 py-4">
                    ${rankBadge}
                </td>

                <td class="px-5 py-4">

                    <div class="font-semibold text-slate-900">
                        ${escapeHtml(row.shelf)}
                    </div>

                    <div class="mt-0.5 text-xs text-slate-400">
                        ${escapeHtml(row.zone || '')}
                    </div>

                </td>

                <td class="px-5 py-4 text-right">

                    <span class="font-semibold text-slate-800">
                        ${formatPercent(row.attention)}
                    </span>

                </td>

                <td class="px-5 py-4 text-right text-sm text-slate-600">
                    ${formatSeconds(row.dwell)}
                </td>

                <td class="px-5 py-4 text-right text-sm text-slate-600">
                    ${formatPercent(row.revisit)}
                </td>

                <td class="px-5 py-4 text-right">

                    <span class="font-bold ${
                        engagement >= 70
                            ? 'text-emerald-600'
                            : engagement >= 40
                                ? 'text-amber-600'
                                : 'text-rose-600'
                    }">
                        ${formatPercent(engagement)}
                    </span>

                </td>

            </tr>

        `;

    }).join('');

}


/* ================================================================
   ANOMALIES
================================================================ */

function renderAnomalies(anomalies) {

    const container = $('anomalyList');

    if (!container) return;

    $('anomalyCount').textContent = anomalies.length;


    if (!anomalies.length) {

        container.innerHTML = `

            <div class="rounded-lg border border-emerald-100 bg-emerald-50 p-4">

                <div class="flex gap-3">

                    <span class="text-lg">
                        ✓
                    </span>

                    <div>

                        <p class="text-sm font-semibold text-emerald-800">
                            No significant anomalies
                        </p>

                        <p class="mt-1 text-xs leading-5 text-emerald-700">
                            Current behavior remains within the historical range.
                        </p>

                    </div>

                </div>

            </div>

        `;

        return;
    }


    container.innerHTML = anomalies.map(anomaly => {

        const isNegative = anomaly.type === 'negative';

        const wrapper =
            isNegative
                ? 'border-rose-100 bg-rose-50'
                : 'border-emerald-100 bg-emerald-50';

        const titleColor =
            isNegative
                ? 'text-rose-800'
                : 'text-emerald-800';

        const textColor =
            isNegative
                ? 'text-rose-700'
                : 'text-emerald-700';

        const icon = isNegative
            ? '⚠'
            : '✓';

        return `

            <div class="rounded-lg border ${wrapper} p-4">

                <div class="flex gap-3">

                    <span class="text-base">
                        ${icon}
                    </span>

                    <div class="min-w-0">

                        <div class="flex flex-wrap items-center gap-2">

                            <p class="text-sm font-bold ${titleColor}">
                                ${escapeHtml(anomaly.title)}
                            </p>

                            <span class="rounded-full bg-white/70 px-2 py-0.5 text-[10px] font-bold ${textColor}">
                                ${escapeHtml(anomaly.change)}
                            </span>

                        </div>

                        <p class="mt-1 text-xs leading-5 ${textColor}">
                            ${escapeHtml(anomaly.description)}
                        </p>

                    </div>

                </div>

            </div>

        `;

    }).join('');

}


/* ================================================================
   PEAK PERIOD CHART
================================================================ */

function renderPeakPeriod(data) {

    const canvas = $('peakPeriodChart');

    if (!canvas) return;

    if (peakPeriodChart) {
        peakPeriodChart.destroy();
    }

    const ctx = canvas.getContext('2d');

    peakPeriodChart = new Chart(ctx, {

        type: 'bar',

        data: {

            labels: data.labels,

            datasets: [{

                data: data.values,

                borderRadius: 5,

                backgroundColor: '#dcd8fa',

                hoverBackgroundColor: '#6657d9',

                borderWidth: 0

            }]

        },

        options: {

            ...chartDefaults(),

            interaction: {
                intersect: false,
                mode: 'index'
            },

            scales: {

                x: {

                    ...chartDefaults().scales.x,

                    ticks: {
                        ...chartDefaults().scales.x.ticks,
                        maxRotation: 0
                    }

                },

                y: {

                    ...chartDefaults().scales.y,

                    beginAtZero: true

                }

            },

            plugins: {

                ...chartDefaults().plugins,

                tooltip: {

                    ...chartDefaults().plugins.tooltip,

                    callbacks: {

                        label: context =>
                            `${number(context.raw).toFixed(0)} avg visitors`

                    }

                }

            }

        }

    });


    $('peakPeriod').textContent = data.peak ? `Peak: ${data.peak}` : 'Peak: —';

}


/* ================================================================
   INTELLIGENCE CARDS
================================================================ */

function renderIntelligenceCards(cards) {

    const container = $('intelligenceCards');

    if (!container) return;


    if (!cards.length) {
        container.innerHTML = '<article class="rounded-xl border border-slate-200 bg-white p-5 text-sm text-slate-400">No historical intelligence is available for the selected period.</article>';
        return;
    }

    container.innerHTML = cards.map(card => {

        const type = card.type || 'neutral';

        const styles = {

            positive: {
                wrapper: 'border-emerald-100 bg-emerald-50/60',
                icon: 'bg-emerald-100 text-emerald-700',
                title: 'text-emerald-900'
            },

            warning: {
                wrapper: 'border-amber-100 bg-amber-50/60',
                icon: 'bg-amber-100 text-amber-700',
                title: 'text-amber-900'
            },

            neutral: {
                wrapper: 'border-slate-200 bg-white',
                icon: 'bg-violet-100 text-violet-700',
                title: 'text-slate-900'
            }

        };

        const style = styles[type] || styles.neutral;


        return `

            <article class="rounded-xl border ${style.wrapper} p-5">

                <div class="flex items-start gap-3">

                    <span class="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${style.icon}">
                        ${escapeHtml(card.icon || '•')}
                    </span>

                    <div>

                        <h3 class="text-sm font-bold ${style.title}">
                            ${escapeHtml(card.title)}
                        </h3>

                        <p class="mt-2 text-xs leading-5 text-slate-600">
                            ${escapeHtml(card.description)}
                        </p>

                    </div>

                </div>

            </article>

        `;

    }).join('');

}


/* ================================================================
   BUILD INTELLIGENCE FROM DATA
================================================================ */

function buildIntelligence(data) {

    const cards = [];

    const attentionChange =
        number(data.comparison?.[0]?.change);

    const dwellChange =
        number(data.comparison?.[1]?.change);

    const topShelf =
        data.rankings?.[0];

    const peak =
        data.peak_period?.peak;


    if (attentionChange > 0) {

        cards.push({

            type: 'positive',

            icon: '↑',

            title: 'Attention is increasing',

            description:
                `Average observed attention increased ${Math.abs(attentionChange).toFixed(0)}% compared with the previous period.`

        });

    } else if (attentionChange < 0) {

        cards.push({

            type: 'warning',

            icon: '↓',

            title: 'Attention is declining',

            description:
                `Average observed attention decreased ${Math.abs(attentionChange).toFixed(0)}% compared with the previous period.`

        });

    } else {

        cards.push({

            type: 'neutral',

            icon: '→',

            title: 'Attention is stable',

            description:
                'Average observed attention remained broadly consistent with the previous period.'

        });

    }


    if (topShelf) {

        cards.push({

            type: 'positive',

            icon: '★',

            title: `${topShelf.shelf} is the engagement leader`,

            description:
                `${topShelf.shelf} recorded ${formatPercent(topShelf.attention)} attention and ${formatSeconds(topShelf.dwell)} average dwell during the selected period.`

        });

    }


    if (peak) {

        cards.push({

            type: 'neutral',

            icon: '◷',

            title: `Peak activity: ${peak}`,

            description:
                'This period shows the highest historical shopper activity concentration during the selected analysis window.'

        });

    }


    return cards.slice(0, 3);

}


/* ================================================================
   UPDATE TREND BADGES
================================================================ */

function updateTrendBadges(data) {

    const attentionChange =
        number(data.comparison?.[0]?.change);

    const dwellChange =
        number(data.comparison?.[1]?.change);


    const attentionBadge = $('attentionTrendChange');

    const dwellBadge = $('dwellTrendChange');


    if (attentionBadge) {

        attentionBadge.textContent =
            formatChange(attentionChange);

        attentionBadge.className =
            `rounded-full px-2.5 py-1 text-xs font-semibold ${
                attentionChange >= 0
                    ? 'bg-emerald-50 text-emerald-700'
                    : 'bg-rose-50 text-rose-700'
            }`;

    }


    if (dwellBadge) {

        dwellBadge.textContent =
            formatChange(dwellChange);

        dwellBadge.className =
            `rounded-full px-2.5 py-1 text-xs font-semibold ${
                dwellChange >= 0
                    ? 'bg-emerald-50 text-emerald-700'
                    : 'bg-rose-50 text-rose-700'
            }`;

    }

}


/* ================================================================
   DEMO / FALLBACK DATA
================================================================ */

function generateDemoData(days = 7) {

    const labels = [];

    const attention = [];

    const dwell = [];


    const now = new Date();


    for (let i = days - 1; i >= 0; i--) {

        const date = new Date(now);

        date.setDate(now.getDate() - i);

        labels.push(
            date.toLocaleDateString(
                undefined,
                {
                    weekday: 'short'
                }
            )
        );


        attention.push(
            Math.round(
                62 +
                Math.sin(i * 0.8) * 5 +
                (days - i) * 0.7
            )
        );


        dwell.push(
            Math.round(
                18 +
                Math.sin(i * 0.7) * 3 +
                (days - i) * 0.8
            )
        );

    }


    return {

        period: days,

        trend: {

            attention: {
                labels,
                values: attention
            },

            dwell: {
                labels,
                values: dwell
            }

        },


        comparison: [

            {
                name: 'Attention',
                previous: '62%',
                current: '71%',
                change: 9
            },

            {
                name: 'Dwell',
                previous: '19s',
                current: '24s',
                change: 26
            },

            {
                name: 'Revisit',
                previous: '11%',
                current: '16%',
                change: 5
            }

        ],


        rankings: [

            {
                shelf: 'A02',
                zone: 'Zone A',
                attention: 84,
                dwell: 31,
                revisit: 22,
                engagement: 91
            },

            {
                shelf: 'A03',
                zone: 'Zone A',
                attention: 76,
                dwell: 27,
                revisit: 18,
                engagement: 82
            },

            {
                shelf: 'A01',
                zone: 'Zone A',
                attention: 61,
                dwell: 19,
                revisit: 11,
                engagement: 65
            },

            {
                shelf: 'A04',
                zone: 'Zone A',
                attention: 42,
                dwell: 12,
                revisit: 6,
                engagement: 39
            }

        ],


        anomalies: [

            {
                type: 'negative',
                title: 'A03 dwell increased',
                change: '+68%',
                description:
                    'Average dwell at A03 is significantly above its historical baseline.'
            },

            {
                type: 'negative',
                title: 'A04 attention decreased',
                change: '-29%',
                description:
                    'Observed attention at A04 is below its historical baseline.'
            }

        ],


        peak_period: {

            labels: [
                '10 AM',
                '11 AM',
                '12 PM',
                '1 PM',
                '2 PM',
                '3 PM',
                '4 PM',
                '5 PM',
                '6 PM',
                '7 PM',
                '8 PM'
            ],

            values: [
                21,
                27,
                34,
                39,
                46,
                52,
                61,
                73,
                81,
                69,
                48
            ],

            peak: '18:00–19:00'

        }

    };

}


/* ================================================================
   API LOADER
================================================================ */

async function loadHistoricalData() {
    const response = await fetch(`${API_URL}?days=${encodeURIComponent(selectedPeriod)}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {}
    });
    if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw new Error(body.detail || 'Unable to load historical retail intelligence');
    }
    return response.json();

}


/* ================================================================
   RENDER EVERYTHING
================================================================ */

async function loadDashboard() {

    try {

        setStatus('Loading historical intelligence...', false);


        const data = await loadHistoricalData();


        if (!data) {
            throw new Error('No historical intelligence data returned');
        }

        console.info('Retail Intelligence historical response:', data);


        /* Trends */

        renderAttentionTrend(
            data.trend.attention
        );

        renderDwellTrend(
            data.trend.dwell
        );


        /* Comparison */

        renderComparisons(data.has_data ? (data.comparison || []) : []);


        /* Rankings */

        renderRankings(data.rankings || []);


        /* Anomalies */

        renderAnomalies(
            data.anomalies || []
        );


        /* Peak periods */

        renderPeakPeriod(
            data.peak_period || {
                labels: [],
                values: []
            }
        );


        /* Trend badges */

        updateTrendBadges(data);


        /* Intelligence */

        renderIntelligenceCards(data.has_data ? buildIntelligence(data) : []);


        /* Updated time */

        const now =
            new Date().toLocaleTimeString(
                undefined,
                {
                    hour: '2-digit',
                    minute: '2-digit'
                }
            );


        $('updatedText').textContent =
            `Updated ${now}`;


        setStatus(data.has_data ? 'Historical analytics ready' : 'No historical analytics for the selected period', false);


    } catch (error) {

        console.error(
            'Retail Intelligence error:',
            error
        );


        setStatus(
            'Historical analytics unavailable',
            true
        );

    }

}


/* ================================================================
   STATUS
================================================================ */

function setStatus(message, error = false) {

    const dot = $('statusDot');
    const text = $('updatedText');

    if (dot) {

        dot.className =
            `h-2 w-2 rounded-full ${
                error
                    ? 'bg-rose-500'
                    : 'bg-emerald-500'
            }`;

    }

    if (text) {
        text.textContent = message;
    }

}


/* ================================================================
   PERIOD CHANGE
================================================================ */

$('periodSelect')?.addEventListener(
    'change',
    async event => {

        selectedPeriod =
            Number(event.target.value) || 7;

        await loadDashboard();

    }
);


/* ================================================================
   INITIAL LOAD
================================================================ */

loadDashboard();
