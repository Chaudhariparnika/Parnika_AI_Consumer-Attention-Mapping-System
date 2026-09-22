const token = localStorage.getItem("access_token");
const REPORTS_API = `${window.API_BASE_URL}/api/production/reports`;
const EXPORT_API = `${window.API_BASE_URL}/api/production/reports/export`;

if (!token) {
	window.location.replace("/login");
}

let reports = [];
let selectedReportType = null;
let reportPrimaryChart = null;
let reportSecondaryChart = null;
const REPORT_CATALOG = [
	["consumer_attention", "Consumer Attention Report"],
	["product_engagement", "Product Engagement Report"],
	["shelf_performance", "Shelf Performance Report"],
].map(([report_type, report_name]) => ({ id: report_type, report_type, report_name }));

class ReportsApiError extends Error {
	constructor(status, message) {
		super(message);
		this.status = status;
	}
}

function authHeaders(extra = {}) {
	return {
		Authorization: `Bearer ${token}`,
		"Content-Type": "application/json",
		...extra,
	};
}

async function request(url, options = {}) {
	const response = await fetch(url, {
		headers: authHeaders(options.headers || {}),
		...options,
	});

	if (!response.ok) {
		const payload = await response.json().catch(() => ({}));
		console.error("Reports API request failed:", {
			url,
			status: response.status,
			response: payload,
		});
		throw new ReportsApiError(response.status, payload.detail || `Request failed (${response.status})`);
	}

	if (response.status === 204) {
		return null;
	}

	return response.json();
}

function openModal(id) {
	const modal = document.getElementById(id);
	if (modal) {
		modal.classList.remove("hidden");
		modal.classList.add("flex");
		modal.setAttribute("aria-hidden", "false");
	}
}

function closeModal(id) {
	const modal = document.getElementById(id);
	if (modal) {
		modal.classList.add("hidden");
		modal.classList.remove("flex");
		modal.setAttribute("aria-hidden", "true");
	}
}

function formatDate(value) {
	if (!value) {
		return "N/A";
	}
	const date = new Date(value);
	if (Number.isNaN(date.getTime())) {
		return "N/A";
	}
	const parts = new Intl.DateTimeFormat("en-GB", {
		day: "2-digit",
		month: "short",
		year: "numeric",
		hour: "numeric",
		minute: "2-digit",
		hour12: true,
	}).formatToParts(date);
	const part = (type) => parts.find((item) => item.type === type)?.value;
	return `${part("day")} ${part("month")} ${part("year")}, ${part("hour")}:${part("minute")} ${String(part("dayPeriod") || "").toUpperCase()}`.trim();
}

function reportTypeLabel(type) {
	return String(type || "-").replace(/_/g, " ").replace(/\b\w/g, (char) => char.toUpperCase());
}

function applyFilters() {
	return reports.filter((report) => report && typeof report === "object");
}

function renderTable() {
	const filtered = applyFilters().filter((report) => report && report.id);
	const body = document.getElementById("reportTableBody");

	if (!filtered.length) {
		body.innerHTML = '<tr><td colspan="3" class="px-5 py-10 text-center text-slate-500">No data available</td></tr>';
		return;
	}

	body.innerHTML = filtered.map((report) => {
		return `
			<tr class="hover:bg-slate-50">
				<td class="px-5 py-4 font-semibold text-slate-800">${report.report_name || "-"}</td>
				<td class="px-5 py-4 text-slate-600">${formatDate(report.created_at)}</td>
				<td class="px-5 py-4"><div class="flex justify-end gap-2">
						<button class="rounded border border-slate-300 px-3 py-1.5 text-sm font-semibold hover:bg-slate-100" data-action="view" data-id="${report.id}">View</button>
						<button class="rounded bg-cyan-700 px-3 py-1.5 text-sm font-semibold text-white hover:bg-cyan-800" data-action="export" data-id="${report.id}">Export</button>
						<button class="rounded border border-red-200 px-3 py-1.5 text-sm font-semibold text-red-700 hover:bg-red-50" data-action="delete" data-id="${report.id}">Delete</button>
					</div>
				</td>
			</tr>
		`;
	}).join("");
}

function renderTableMessage(message) {
	const body = document.getElementById("reportTableBody");
	if (body) {
		body.innerHTML = `<tr><td colspan="3" class="px-5 py-10 text-center text-slate-500">${message}</td></tr>`;
	}
}

function reportLoadMessage(error) {
	if (error instanceof ReportsApiError) {
		if (error.status === 401) return "Your session has expired. Redirecting to sign in...";
		if (error.status === 403) return "You do not have permission to view reports.";
		if (error.status === 404) return "Reports are currently unavailable.";
		if (error.status >= 500) return "Reports could not be loaded due to a server error.";
	}
	return "Reports could not be loaded. Please try again.";
}

async function loadReports() {
	if (!token) {
		return;
	}
	try {
		const response = await request(REPORTS_API);
		reports = Array.isArray(response)
			? response.filter((report) => report && typeof report === "object")
			: [];
		renderTable();
	} catch (error) {
		console.error("Unable to refresh the report catalog:", error);
		reports = [];
		renderTableMessage(reportLoadMessage(error));
		if (error instanceof ReportsApiError && error.status === 401) {
			localStorage.removeItem("access_token");
			localStorage.removeItem("full_name");
			localStorage.removeItem("role");
			window.location.replace("/login");
		}
	}
}

function destroyReportCharts() {
	[reportPrimaryChart, reportSecondaryChart].forEach((chart) => {
		if (chart && typeof chart.destroy === "function") chart.destroy();
	});
	reportPrimaryChart = null;
	reportSecondaryChart = null;
	if (typeof Chart !== "undefined" && typeof Chart.getChart === "function") {
		["reportPrimaryChart", "reportSecondaryChart"].forEach((id) => {
			const canvas = document.getElementById(id);
			const chart = canvas && Chart.getChart(canvas);
			if (chart) chart.destroy();
		});
	}
}

function renderReportCharts(data) {
	destroyReportCharts();
	if (typeof Chart === "undefined") return;
	const charts = data && data.charts && typeof data.charts === "object" ? data.charts : {};
	const labels = Array.isArray(charts.labels) && charts.labels.length ? charts.labels : ["No data"];
	const datasets = Array.isArray(charts.datasets) ? charts.datasets : [];
	const primaryCanvas = document.getElementById("reportPrimaryChart");
	const secondaryCanvas = document.getElementById("reportSecondaryChart");
	if (primaryCanvas && datasets[0]) {
		reportPrimaryChart = new Chart(primaryCanvas.getContext("2d"), {
			type: datasets[0].kind || "bar", data: { labels, datasets: [{ label: datasets[0].label, data: datasets[0].data || [], backgroundColor: "rgba(32,94,219,.35)", borderColor: "#205edb", borderWidth: 2 }] },
			options: { responsive: true, maintainAspectRatio: false, scales: { y: { beginAtZero: true } } }
		});
	}
	if (secondaryCanvas && datasets[1]) {
		reportSecondaryChart = new Chart(secondaryCanvas.getContext("2d"), {
			type: datasets[1].kind || "bar", data: { labels, datasets: [{ label: datasets[1].label, data: datasets[1].data || [], backgroundColor: "rgba(42,156,107,.45)", borderColor: "#2a9c6b", borderWidth: 2 }] },
			options: { responsive: true, maintainAspectRatio: false, scales: { y: { beginAtZero: true } } }
		});
	}
}

function renderViewModal(report) {
    const container = document.getElementById("viewReportContent");

    if (!container || !report) {
        return;
    }

    // Support both report.data.rows or report.data directly as an array
    const rawRows = Array.isArray(report.data?.rows)
        ? report.data.rows
        : (Array.isArray(report.data) ? report.data : []);

    if (!rawRows.length) {
		container.innerHTML = '<p class="py-10 text-center text-slate-500">No analyzed data is available for this report.</p>';
        destroyReportCharts();
        return;
    }

    const columns = Object.keys(rawRows[0]);

	const isCustomerAttention = report.report_type === "consumer_attention";
	const reportHeading = isCustomerAttention
		? '<h3 class="mb-4 text-lg font-bold text-slate-900">Customer Attention</h3>'
		: "";
	const reportTable = `
		<div class="overflow-x-auto border border-slate-200">
			<table class="w-full text-left text-sm">
				<thead class="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
					<tr>${columns.map((column) => `<th>${formatColumnName(column)}</th>`).join("")}</tr>
				</thead>
				<tbody class="divide-y divide-slate-100">
					${rawRows.map((row) => `
						<tr>${columns.map((column) => `<td>${formatCellValue(row[column])}</td>`).join("")}</tr>
					`).join("")}
				</tbody>
			</table>
		</div>`;
	const reportCharts = `
		<div class="grid gap-4 lg:grid-cols-2">
			<div class="h-72 border border-slate-200 bg-slate-50 p-3"><canvas id="reportPrimaryChart"></canvas></div>
			<div class="h-72 border border-slate-200 bg-slate-50 p-3"><canvas id="reportSecondaryChart"></canvas></div>
		</div>`;

    container.innerHTML = `
		${reportHeading}
		${isCustomerAttention ? `${reportTable}<div class="mt-5">${reportCharts}</div>` : `${reportCharts}<div class="mt-5">${reportTable}</div>`}
    `;

    // Render charts if backend provides chart datasets
	renderReportCharts(report.data);
}

// Helper to format values cleanly
function formatCellValue(val) {
    if (val === null || val === undefined || val === "") return "-";
    if (typeof val === "number") {
        return Number.isInteger(val) ? val.toLocaleString() : val.toFixed(2);
    }
    if (typeof val === "object") {
        return JSON.stringify(val);
    }
    return val;
}

function formatColumnName(column) {
    return String(column)
        .replace(/_/g, " ")
        .replace(/\b\w/g, char => char.toUpperCase());
}

function selectedStoreId() {
	const value = document.getElementById("storeScopeId").value;
	return value ? Number(value) : null;
}

function reportUrl(path, reportType) {
	const params = new URLSearchParams();
	const storeId = selectedStoreId();
	if (storeId) params.set("store_id", String(storeId));
	return `${path}/${encodeURIComponent(reportType)}${params.size ? `?${params}` : ""}`;
}

async function exportReport(format, reportType) {
	if (!reportType) throw new Error("Select a report before exporting it");
	const params = new URLSearchParams({ report_type: reportType, format });
	const storeId = selectedStoreId();
	if (storeId) params.set("store_id", String(storeId));
	const response = await fetch(`${EXPORT_API}?${params}`, {
		method: "GET",
		headers: {
			Authorization: `Bearer ${token}`,
		},
	});

	if (!response.ok) {
		const payload = await response.json().catch(() => ({}));
		throw new Error(payload.detail || "Export failed");
	}

	const blob = await response.blob();
	const url = URL.createObjectURL(blob);
	const link = document.createElement("a");
	const extension = format === "xlsx" ? "xlsx" : format;
	link.href = url;
	link.download = `${reportType}.${extension}`;
	document.body.appendChild(link);
	link.click();
	link.remove();
	URL.revokeObjectURL(url);
}

async function submitExport(event) {
	event.preventDefault();
	const format = document.getElementById("exportFormat").value;
	try {
		await exportReport(format, selectedReportType);
		closeModal("exportModal");
	} catch (error) {
		alert(error.message);
	}
}

function handleTableActions(event) {
	const button = event.target.closest("button[data-action]");
	if (!button) {
		return;
	}

	const action = button.getAttribute("data-action");
	const reportType = button.getAttribute("data-id");
	const report = reports.find((item) => item && String(item.id) === reportType);
	if (!report) {
		return;
	}

	if (action === "view") {
		selectedReportType = report.report_type;
		request(reportUrl(`${REPORTS_API}/detail`, report.report_type)).then((detail) => {
			renderViewModal(detail);
			openModal("viewModal");
		}).catch((error) => alert(error.message));
		return;
	}

	if (action === "export") {
		selectedReportType = report.report_type;
		openModal("exportModal");
		return;
	}

	if (action === "delete") {
		if (!window.confirm(`Delete the ${report.report_name} definition? Analytics data will remain available.`)) {
			return;
		}
		request(`${REPORTS_API}/${encodeURIComponent(report.id)}`, { method: "DELETE" })
			.then(() => loadReports())
			.catch((error) => alert(error.message));
	}
}

function setupEvents() {
	const storedStoreId = localStorage.getItem("reports_store_id");
	if (storedStoreId && /^\d+$/.test(storedStoreId)) {
		document.getElementById("storeScopeId").value = storedStoreId;
	}
	document.getElementById("exportForm").addEventListener("submit", submitExport);
	document.getElementById("reportTableBody").addEventListener("click", handleTableActions);

	document.querySelectorAll("[data-close]").forEach((button) => {
		button.addEventListener("click", () => closeModal(button.getAttribute("data-close")));
	});

	document.querySelectorAll(".modal").forEach((modal) => {
		modal.addEventListener("click", (event) => {
			if (event.target === modal) {
				closeModal(modal.id);
			}
		});
	});
}

setupEvents();
loadReports();
