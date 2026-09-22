const token = localStorage.getItem("access_token");

if (!token) {
    window.location.href = "/login";
}

// ============================================================
// Utility Functions
// ============================================================

function setText(id, value) {
    const el = document.getElementById(id);
    if (el) el.textContent = value;
}

function showElement(id) {
    const el = document.getElementById(id);
    if (el) el.style.display = "";
}

function hideElement(id) {
    const el = document.getElementById(id);
    if (el) el.style.display = "none";
}

function destroyChart(chartInstance) {
    if (chartInstance && typeof chartInstance.destroy === "function") {
        chartInstance.destroy();
    }
}

function updateSyncStatus(message) {
    const status = document.getElementById("syncStatus");
    if (status) {
        status.textContent = message || "Live";
    }
}

// ============================================================
// Chart Instance Management
// ============================================================

const chartInstances = {
    attentionByShelf: null,
    dwellTime: null,
    attentionTrend: null,
    dwellTrend: null
};

// ============================================================
// Main Dashboard Load
// ============================================================

document.addEventListener("DOMContentLoaded", async () => {
    try {
        // Set logout button
        const logoutBtn = document.getElementById("logoutBtn");
        if (logoutBtn) {
            logoutBtn.addEventListener("click", () => {
                localStorage.removeItem("access_token");
                document.cookie = "access_token=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;";
                window.location.href = "/login";
            });
        }

        // Set period filter listener
        const periodFilter = document.getElementById("periodFilter");
        periodFilter.addEventListener("change", () => {
            loadDashboardData();
        });

        // Initial data load
        await loadDashboardData();

        // Auto-refresh every 30 seconds
        setInterval(() => {
            loadDashboardData().catch(err => console.error("Auto-refresh failed:", err));
        }, 30000);

    } catch (error) {
        console.error("Dashboard initialization error:", error);
        hideElement("loadingOverlay");
        updateSyncStatus("Error loading data");
    }
});

// Helper: Fetch with timeout and proper error handling
async function fetchWithTimeout(url, options = {}, timeoutMs = 10000) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    try {
        const requestUrl = url.startsWith("/") ? `${window.API_BASE_URL}${url}` : url;
        const response = await fetch(requestUrl, { ...options, signal: controller.signal });
        clearTimeout(timeout);
        return response;
    } catch (error) {
        clearTimeout(timeout);
        throw error;
    }
}

async function loadDashboardData() {
    try {
        const period = document.getElementById("periodFilter")?.value || "7";
        updateSyncStatus("Syncing...");

        let liveData = null;
        let historyData = null;
        let hasError = false;

        // Load live analytics with timeout (10 seconds max)
        try {
            const liveResponse = await fetchWithTimeout(
                "/api/production/analytics/live",
                { headers: { "Authorization": `Bearer ${token}` } },
                10000
            );

            if (!liveResponse.ok) {
                if (liveResponse.status === 401) {
                    window.location.href = "/login";
                    return;
                }
                console.warn(`Live analytics error: ${liveResponse.status}`);
                hasError = true;
            } else {
                liveData = await liveResponse.json();
            }
        } catch (error) {
            console.error("Live analytics fetch failed:", error.message);
            hasError = true;
        }

        // Load historical data with timeout (10 seconds max, independent)
        try {
            const historyResponse = await fetchWithTimeout(
                `/api/production/analytics/retail-intelligence?days=${period}`,
                { headers: { "Authorization": `Bearer ${token}` } },
                10000
            );

            if (!historyResponse.ok) {
                console.warn(`Historical data error: ${historyResponse.status}`);
                hasError = true;
            } else {
                historyData = await historyResponse.json();
            }
        } catch (error) {
            console.error("Historical data fetch failed:", error.message);
            hasError = true;
        }

        // Render sections with available data (don't wait for all APIs)
        if (liveData) {
            renderKPIs(liveData);
            renderAttentionByShelf(liveData);
            renderDwellTimeChart(liveData);
            renderTopProducts(liveData);
            renderProductEngagementTable(liveData);
            renderShelfPerformance(liveData);
            renderCustomerJourneys(liveData);
            renderBehavioralSignals(liveData);
            renderTopShelvesRankings(liveData);
            renderMarketingOpportunities(liveData);
        }

        // Render historical data if available
        if (historyData) {
            renderHistoricalTrends(historyData);
        }

        hideElement("loadingOverlay");

        // Show status based on what loaded successfully
        if (!liveData && !historyData) {
            updateSyncStatus("Unable to load data");
        } else if (hasError) {
            updateSyncStatus(`Live (partial) · ${new Date().toLocaleTimeString()}`);
        } else {
            updateSyncStatus(`Live · ${new Date().toLocaleTimeString()}`);
        }

    } catch (error) {
        console.error("Dashboard load error:", error);
        hideElement("loadingOverlay");
        updateSyncStatus("Error loading data");
    }
}

// ============================================================
// KPI Cards
// ============================================================

function renderKPIs(data) {
    const ci = data.consumer_intelligence || {};
    const track_count = ci.customer_count || 0;

    setText("kpi-total-customers", track_count > 0 ? track_count.toLocaleString() : "—");
    setText("kpi-avg-attention", ci.average_attention != null ? ci.average_attention.toFixed(1) : "—");
    setText("kpi-avg-dwell", ci.average_dwell != null ? ci.average_dwell.toFixed(1) : "—");
    setText("kpi-engaged-customers", track_count > 0 ? Math.round(track_count * (ci.engagement_rate || 0) / 100).toLocaleString() : "—");
    setText("kpi-high-interest", (ci.high_interest_rate || 0).toFixed(1));
    setText("kpi-revisit-rate", (ci.revisit_rate || 0).toFixed(1));

    setText("kpi-engaged-customers-pct", `${(ci.engagement_rate || 0).toFixed(1)}%`);
    setText("kpi-high-interest-pct", `${(ci.high_interest_rate || 0).toFixed(1)}%`);
    setText("kpi-revisit-rate-pct", `${(ci.revisit_rate || 0).toFixed(1)}%`);
}

// ============================================================
// Attention by Shelf Chart
// ============================================================

function renderAttentionByShelf(data) {
    const shelves = (data.shelf_intelligence || []).slice(0, 8);

    if (!shelves.length) {
        showElement("attentionByShelfEmpty");
        return;
    }

    hideElement("attentionByShelfEmpty");

    const canvas = document.getElementById("attentionByShelfChart");
    if (!canvas) return;

    destroyChart(chartInstances.attentionByShelf);

    chartInstances.attentionByShelf = new Chart(canvas.getContext("2d"), {
        type: "bar",
        data: {
            labels: shelves.map(s => s.name),
            datasets: [{
                label: "Average Attention Score",
                data: shelves.map(s => s.attention || 0),
                backgroundColor: "rgba(59, 130, 246, 0.8)",
                borderColor: "rgba(59, 130, 246, 1)",
                borderWidth: 1,
                borderRadius: 6
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: true, position: "top", labels: { color: "#1f2937", font: { size: 12, weight: "500" } } }
            },
            scales: {
                y: {
                    beginAtZero: true,
                    max: 100,
                    ticks: { color: "#6b7280", font: { size: 11 } },
                    grid: { color: "rgba(0,0,0,0.05)" }
                },
                x: {
                    ticks: { color: "#6b7280", font: { size: 11 } },
                    grid: { display: false }
                }
            }
        }
    });
}

// ============================================================
// Dwell Time Distribution Chart
// ============================================================

function renderDwellTimeChart(data) {
    const shelves = (data.shelf_intelligence || []).slice(0, 8);

    if (!shelves.length) {
        showElement("dwellTimeEmpty");
        return;
    }

    hideElement("dwellTimeEmpty");

    const canvas = document.getElementById("dwellTimeChart");
    if (!canvas) return;

    destroyChart(chartInstances.dwellTime);

    chartInstances.dwellTime = new Chart(canvas.getContext("2d"), {
        type: "bar",
        data: {
            labels: shelves.map(s => s.name),
            datasets: [{
                label: "Average Dwell Time (seconds)",
                data: shelves.map(s => s.average_dwell || 0),
                backgroundColor: "rgba(168, 85, 247, 0.8)",
                borderColor: "rgba(168, 85, 247, 1)",
                borderWidth: 1,
                borderRadius: 6
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: true, position: "top", labels: { color: "#1f2937", font: { size: 12, weight: "500" } } }
            },
            scales: {
                y: {
                    beginAtZero: true,
                    ticks: { color: "#6b7280", font: { size: 11 } },
                    grid: { color: "rgba(0,0,0,0.05)" }
                },
                x: {
                    ticks: { color: "#6b7280", font: { size: 11 } },
                    grid: { display: false }
                }
            }
        }
    });
}

// ============================================================
// Top 3 Product Attractions
// ============================================================

function renderTopProducts(data) {
    const products = (data.product_attractiveness || [])
        .filter(p => p.attractiveness_score != null)
        .sort((a, b) => (b.attractiveness_score || 0) - (a.attractiveness_score || 0))
        .slice(0, 3);

    const container = document.getElementById("topProductsContainer");
    const emptyMsg = document.getElementById("topProductsEmpty");

    if (!products.length) {
        showElement("topProductsEmpty");
        container.innerHTML = "";
        return;
    }

    hideElement("topProductsEmpty");

    container.innerHTML = products.map((p, idx) => `
        <div class="rounded-lg border border-blue-200 bg-blue-50 p-4">
            <div class="mb-3 flex items-baseline gap-2">
                <span class="text-2xl font-bold text-blue-600">#${idx + 1}</span>
                <span class="text-sm text-slate-500">Attraction Score</span>
            </div>
            <h4 class="font-semibold text-slate-900">${p.product_name || `Product ${p.product_id}`}</h4>
            <p class="mt-1 text-sm text-slate-600">Shelf ${p.shelf_id || "N/A"}</p>
            <div class="mt-3 space-y-2 text-sm">
                <div class="flex justify-between">
                    <span class="text-slate-600">Score:</span>
                    <span class="font-semibold text-blue-600">${(p.attractiveness_score || 0).toFixed(1)}</span>
                </div>
                <div class="flex justify-between">
                    <span class="text-slate-600">Engaged:</span>
                    <span class="font-semibold text-slate-900">${p.customers_engaged || 0}</span>
                </div>
                <div class="flex justify-between">
                    <span class="text-slate-600">Avg Attention:</span>
                    <span class="font-semibold text-slate-900">${(p.average_attention || 0).toFixed(1)}</span>
                </div>
            </div>
        </div>
    `).join("");
}

// ============================================================
// Product Engagement Table
// ============================================================

function renderProductEngagementTable(data) {
    const products = (data.product_attractiveness || [])
        .filter(p => p.product_name)
        .sort((a, b) => (b.customers_engaged || 0) - (a.customers_engaged || 0))
        .slice(0, 15);

    const tbody = document.getElementById("productEngagementTableBody");
    const emptyMsg = document.getElementById("productEngagementEmpty");

    if (!products.length) {
        showElement("productEngagementEmpty");
        tbody.innerHTML = "";
        return;
    }

    hideElement("productEngagementEmpty");

    tbody.innerHTML = products.map(p => `
        <tr class="border-b border-slate-200 hover:bg-slate-50 transition">
            <td class="px-4 py-3 text-slate-900">${p.product_name || `Product ${p.product_id}`}</td>
            <td class="px-4 py-3 text-slate-900">${p.shelf_id || "—"}</td>
            <td class="px-4 py-3 text-center text-slate-900">${p.customers_engaged || 0}</td>
            <td class="px-4 py-3 text-center text-slate-900">${(p.average_attention || 0).toFixed(1)}</td>
            <td class="px-4 py-3 text-center text-slate-900">${(p.average_dwell_time || 0).toFixed(1)}</td>
        </tr>
    `).join("");
}

// ============================================================
// Shelf Performance Ranking
// ============================================================

function renderShelfPerformance(data) {
    const shelves = (data.shelf_intelligence || [])
        .slice(0, 20);

    const tbody = document.getElementById("shelfPerformanceTableBody");
    const emptyMsg = document.getElementById("shelfPerformanceEmpty");

    if (!shelves.length) {
        showElement("shelfPerformanceEmpty");
        tbody.innerHTML = "";
        return;
    }

    hideElement("shelfPerformanceEmpty");

    tbody.innerHTML = shelves.map(s => `
        <tr class="border-b border-slate-200 hover:bg-slate-50 transition">
            <td class="px-4 py-3 font-medium text-slate-900">${s.name}</td>
            <td class="px-4 py-3 text-slate-900">${s.zone || "Unassigned"}</td>
            <td class="px-4 py-3 text-center text-slate-900">${s.visitors || 0}</td>
            <td class="px-4 py-3 text-center text-slate-900">${(s.average_dwell || 0).toFixed(1)}</td>
            <td class="px-4 py-3 text-center text-slate-900">${(s.attention || 0).toFixed(1)}</td>
            <td class="px-4 py-3 text-center text-slate-900">${s.quick_pass_rate || 0}</td>
            <td class="px-4 py-3 text-center text-slate-900">${(s.revisit_rate || 0).toFixed(1)}</td>
        </tr>
    `).join("");
}

// ============================================================
// Customer Journey Patterns (Top 5)
// ============================================================

function renderCustomerJourneys(data) {
    const paths = (data.common_paths || []).slice(0, 5);

    const container = document.getElementById("customerJourneyContainer");
    const emptyMsg = document.getElementById("customerJourneyEmpty");

    if (!paths.length) {
        showElement("customerJourneyEmpty");
        container.innerHTML = "";
        return;
    }

    hideElement("customerJourneyEmpty");

    container.innerHTML = paths.map((p, idx) => {
        const pathStr = typeof p === "string" ? p : (p.path || "N/A");
        const count = p.customer_count || p.count || 0;
        const pct = p.percentage || 0;
        const duration = p.avg_duration || 0;

        return `
            <div class="rounded-lg border border-slate-200 bg-white p-4">
                <div class="flex items-start justify-between">
                    <div class="flex-1">
                        <p class="text-sm font-semibold text-slate-600">Journey #${idx + 1}</p>
                        <p class="mt-1 text-slate-900">${pathStr}</p>
                        <div class="mt-3 grid grid-cols-3 gap-4 text-sm">
                            <div>
                                <span class="text-slate-600">Customers:</span>
                                <p class="font-semibold text-slate-900">${count}</p>
                            </div>
                            <div>
                                <span class="text-slate-600">Percentage:</span>
                                <p class="font-semibold text-slate-900">${pct.toFixed(1)}%</p>
                            </div>
                            <div>
                                <span class="text-slate-600">Avg Duration:</span>
                                <p class="font-semibold text-slate-900">${duration}s</p>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        `;
    }).join("");
}

// ============================================================
// Behavioral Signals
// ============================================================

function renderBehavioralSignals(data) {
    const signals = data.behavior_distribution || {};

    setText("signal-quick-pass", `${(signals.quick_pass || 0).toFixed(1)}%`);
    setText("signal-browsing", `${(signals.browsing || 0).toFixed(1)}%`);
    setText("signal-high-interest", `${(signals.high_interest || 0).toFixed(1)}%`);
    setText("signal-revisit", `${(signals.revisit || 0).toFixed(1)}%`);
}

// ============================================================
// Historical Trends
// ============================================================

function renderHistoricalTrends(data) {
    const trendData = data.trend || {};
    const attentionTrend = trendData.attention || { labels: [], values: [] };
    const dwellTrend = trendData.dwell || { labels: [], values: [] };

    // Attention Trend Chart
    const attentionCanvas = document.getElementById("attentionTrendChart");
    if (attentionCanvas && attentionTrend.labels && attentionTrend.labels.length) {
        hideElement("attentionTrendEmpty");
        destroyChart(chartInstances.attentionTrend);

        chartInstances.attentionTrend = new Chart(attentionCanvas.getContext("2d"), {
            type: "line",
            data: {
                labels: attentionTrend.labels,
                datasets: [{
                    label: "Average Attention Score",
                    data: attentionTrend.values.map(v => v === null ? null : v),
                    borderColor: "rgba(59, 130, 246, 1)",
                    backgroundColor: "rgba(59, 130, 246, 0.1)",
                    borderWidth: 2,
                    fill: true,
                    tension: 0.4,
                    pointRadius: 4,
                    pointBackgroundColor: "rgba(59, 130, 246, 1)",
                    pointBorderColor: "rgba(255,255,255,0.8)",
                    pointBorderWidth: 2
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: { legend: { display: true, position: "top", labels: { color: "#1f2937", font: { size: 12, weight: "500" } } } },
                scales: {
                    y: {
                        beginAtZero: true,
                        max: 100,
                        ticks: { color: "#6b7280", font: { size: 11 } },
                        grid: { color: "rgba(0,0,0,0.05)" }
                    },
                    x: {
                        ticks: { color: "#6b7280", font: { size: 11 } },
                        grid: { display: false }
                    }
                }
            }
        });
    } else {
        showElement("attentionTrendEmpty");
    }

    // Dwell Time Trend Chart
    const dwellCanvas = document.getElementById("dwellTrendChart");
    if (dwellCanvas && dwellTrend.labels && dwellTrend.labels.length) {
        hideElement("dwellTrendEmpty");
        destroyChart(chartInstances.dwellTrend);

        chartInstances.dwellTrend = new Chart(dwellCanvas.getContext("2d"), {
            type: "line",
            data: {
                labels: dwellTrend.labels,
                datasets: [{
                    label: "Average Dwell Time (seconds)",
                    data: dwellTrend.values.map(v => v === null ? null : v),
                    borderColor: "rgba(168, 85, 247, 1)",
                    backgroundColor: "rgba(168, 85, 247, 0.1)",
                    borderWidth: 2,
                    fill: true,
                    tension: 0.4,
                    pointRadius: 4,
                    pointBackgroundColor: "rgba(168, 85, 247, 1)",
                    pointBorderColor: "rgba(255,255,255,0.8)",
                    pointBorderWidth: 2
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: { legend: { display: true, position: "top", labels: { color: "#1f2937", font: { size: 12, weight: "500" } } } },
                scales: {
                    y: {
                        beginAtZero: true,
                        ticks: { color: "#6b7280", font: { size: 11 } },
                        grid: { color: "rgba(0,0,0,0.05)" }
                    },
                    x: {
                        ticks: { color: "#6b7280", font: { size: 11 } },
                        grid: { display: false }
                    }
                }
            }
        });
    } else {
        showElement("dwellTrendEmpty");
    }
}

// ============================================================
// Top Shelves Rankings
// ============================================================

function renderTopShelvesRankings(data) {
    const shelves = (data.shelf_intelligence || []).slice(0, 5);

    // Top by Attention
    const attentionContainer = document.getElementById("topShelvesAttention");
    const attentionEmpty = document.getElementById("topShelvesAttentionEmpty");

    if (!shelves.length) {
        showElement("topShelvesAttentionEmpty");
        attentionContainer.innerHTML = "";
    } else {
        hideElement("topShelvesAttentionEmpty");
        const byAttention = [...shelves].sort((a, b) => (b.attention || 0) - (a.attention || 0)).slice(0, 5);
        attentionContainer.innerHTML = byAttention.map((s, i) => `
            <div class="flex items-center justify-between rounded-lg bg-slate-50 p-3 border border-slate-200">
                <span class="text-sm text-slate-700">${i + 1}. ${s.name}</span>
                <span class="font-semibold text-blue-600">${(s.attention || 0).toFixed(1)}</span>
            </div>
        `).join("");
    }

    // Top by Dwell Time
    const dwellContainer = document.getElementById("topShelvesDwell");
    const dwellEmpty = document.getElementById("topShelvesDwellEmpty");

    if (!shelves.length) {
        showElement("topShelvesDwellEmpty");
        dwellContainer.innerHTML = "";
    } else {
        hideElement("topShelvesDwellEmpty");
        const byDwell = [...shelves].sort((a, b) => (b.average_dwell || 0) - (a.average_dwell || 0)).slice(0, 5);
        dwellContainer.innerHTML = byDwell.map((s, i) => `
            <div class="flex items-center justify-between rounded-lg bg-slate-50 p-3 border border-slate-200">
                <span class="text-sm text-slate-700">${i + 1}. ${s.name}</span>
                <span class="font-semibold text-purple-600">${(s.average_dwell || 0).toFixed(1)}s</span>
            </div>
        `).join("");
    }
}

// ============================================================
// Marketing Opportunities
// ============================================================

function renderMarketingOpportunities(data) {
    const opportunities = [];
    const shelves = data.shelf_intelligence || [];
    const products = data.product_attractiveness || [];
    const ci = data.consumer_intelligence || {};

    // High traffic + low attention areas
    shelves.forEach(shelf => {
        if (shelf.visitors > 5 && (shelf.attention || 0) < 40) {
            opportunities.push({
                type: "warning",
                title: `Low Engagement on ${shelf.name}`,
                description: `Despite ${shelf.visitors} visitors, attention score is only ${(shelf.attention || 0).toFixed(1)}. Consider product placement or promotional materials.`,
                icon: "⚠️"
            });
        }
    });

    // High attention products
    const topAttractionProducts = products
        .filter(p => p.attractiveness_score && p.attractiveness_score > 75)
        .slice(0, 2);
    topAttractionProducts.forEach(p => {
        opportunities.push({
            type: "success",
            title: `High Attraction: ${p.product_name || `Product ${p.product_id}`}`,
            description: `Attraction score ${(p.attractiveness_score || 0).toFixed(1)} with ${p.customers_engaged || 0} engaged customers. Consider cross-promotion.`,
            icon: "✨"
        });
    });

    // High dwell shelves
    const highDwellShelves = shelves
        .filter(s => (s.average_dwell || 0) > 10)
        .slice(0, 2);
    highDwellShelves.forEach(s => {
        opportunities.push({
            type: "info",
            title: `Extended Browsing: ${s.name}`,
            description: `Average dwell time ${(s.average_dwell || 0).toFixed(1)}s indicates strong customer interest. Ideal for premium or new products.`,
            icon: "⏱️"
        });
    });

    // Frequently revisited shelves
    const revisitShelves = shelves
        .filter(s => (s.revisit_rate || 0) > 20)
        .slice(0, 2);
    revisitShelves.forEach(s => {
        opportunities.push({
            type: "primary",
            title: `Loyal Area: ${s.name}`,
            description: `${(s.revisit_rate || 0).toFixed(1)}% revisit rate shows strong customer attachment. Maintain product assortment and visibility.`,
            icon: "🔄"
        });
    });

    const container = document.getElementById("marketingOpportunitiesContainer");
    const emptyMsg = document.getElementById("marketingOpportunitiesEmpty");

    if (!opportunities.length) {
        showElement("marketingOpportunitiesEmpty");
        container.innerHTML = "";
        return;
    }

    hideElement("marketingOpportunitiesEmpty");

    const colorMap = {
        success: "border-green-200 bg-green-50",
        warning: "border-yellow-200 bg-yellow-50",
        info: "border-blue-200 bg-blue-50",
        primary: "border-purple-200 bg-purple-50"
    };

    container.innerHTML = opportunities.slice(0, 6).map(opp => `
        <div class="rounded-lg border ${colorMap[opp.type] || colorMap.primary} p-4">
            <div class="flex gap-3">
                <span class="text-2xl">${opp.icon}</span>
                <div class="flex-1">
                    <h4 class="font-semibold text-slate-900">${opp.title}</h4>
                    <p class="mt-1 text-sm text-slate-700">${opp.description}</p>
                </div>
            </div>
        </div>
    `).join("");
}
