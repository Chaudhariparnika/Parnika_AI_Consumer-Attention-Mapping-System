const token = localStorage.getItem("access_token");
if (!token) {
    window.location.href = "/";
}

const storeSelect = document.getElementById("storeSelect");
const cameraSelect = document.getElementById("cameraSelect");
const videoForm = document.getElementById("videoForm");
const videoFile = document.getElementById("videoFile");
const maxFrames = document.getElementById("maxFrames");
const confThreshold = document.getElementById("confThreshold");
const runBtn = document.getElementById("runBtn");
const statusBox = document.getElementById("statusBox");
const annotatedVideo = document.getElementById("annotatedVideo");

const mProcessed = document.getElementById("mProcessed");
const mRows = document.getElementById("mRows");
const mAttention = document.getElementById("mAttention");
const mDwell = document.getElementById("mDwell");

let attentionChart;
let dwellChart;

function getCanvasContext(canvasId) {
    const canvas = document.getElementById(canvasId);
    if (!canvas || typeof canvas.getContext !== "function") {
        return null;
    }
    return canvas.getContext("2d");
}

function destroyCanvasChart(canvas, chartInstance) {
    if (chartInstance && typeof chartInstance.destroy === "function") {
        chartInstance.destroy();
    }
    // Covers charts created by a previous render/script instance too.
    if (typeof Chart !== "undefined" && typeof Chart.getChart === "function" && canvas) {
        const existing = Chart.getChart(canvas);
        if (existing && existing !== chartInstance) existing.destroy();
    }
}

function setStatus(message, kind = "ok") {
    if (!statusBox) {
        return;
    }
    statusBox.textContent = message;
    statusBox.className = `status show ${kind}`;
}

function clearStatus() {
    if (!statusBox) {
        return;
    }
    statusBox.className = "status";
    statusBox.textContent = "";
}

function safeNumber(value, fallback = 0) {
    const n = Number(value);
    return Number.isFinite(n) ? n : fallback;
}

function headers() {
    return {
        Authorization: `Bearer ${token}`
    };
}

async function displayAnnotatedVideo(videoUrl) {
    if (!annotatedVideo || !videoUrl) {
        throw new Error("Annotated video URL was not returned by the analysis service.");
    }

    const response = await fetch(videoUrl, { method: "HEAD", cache: "no-store" });
    console.info("Annotated video HTTP status:", response.status, videoUrl);
    if (!response.ok) {
        throw new Error(`Annotated video is unavailable (HTTP ${response.status}).`);
    }

    annotatedVideo.pause();
    annotatedVideo.removeAttribute("src");
    annotatedVideo.load();
    annotatedVideo.src = videoUrl;
    annotatedVideo.classList.add("show");
    console.info("Annotated video src:", annotatedVideo.src);
    annotatedVideo.load();
}

async function loadStores() {
    if (!storeSelect) {
        return;
    }

    storeSelect.innerHTML = "<option value=''>Loading stores...</option>";
    try {
        const response = await fetch(`${window.API_BASE_URL}/api/production/stores?page=1&page_size=200`, {
            headers: headers()
        });
        if (!response.ok) {
            throw new Error("Unable to fetch stores");
        }
        const stores = await response.json();
        const normalizedStores = Array.isArray(stores)
            ? stores.filter((store) => store && store.id != null)
            : [];

        if (normalizedStores.length === 0) {
            storeSelect.innerHTML = "<option value=''>No stores found</option>";
            if (cameraSelect) {
                cameraSelect.innerHTML = "<option value=''>Select a valid store</option>";
                cameraSelect.disabled = true;
            }
            return;
        }
        storeSelect.innerHTML = normalizedStores
            .map((store) => `<option value="${store.id}">${store.store_name} (ID: ${store.id})</option>`)
            .join("");
        if (cameraSelect) {
            const initialStoreId = storeSelect.value;
            await loadCamerasForStore(initialStoreId);
        }
    } catch (error) {
        console.error(error);
        storeSelect.innerHTML = "<option value='1'>Store ID 1 (fallback)</option>";
        if (cameraSelect) {
            cameraSelect.innerHTML = "<option value=''>Camera unavailable</option>";
            cameraSelect.disabled = true;
        }
        setStatus("Could not load store list, fallbacking to Store ID 1.", "err");
    }
}

async function loadCamerasForStore(storeId) {
    if (!cameraSelect) {
        return;
    }

    if (!storeId) {
        cameraSelect.innerHTML = "<option value=''>Select a store first</option>";
        cameraSelect.disabled = true;
        return;
    }

    cameraSelect.disabled = true;
    cameraSelect.innerHTML = "<option value=''>Loading cameras...</option>";

    try {
        const response = await fetch(`${window.API_BASE_URL}/api/production/cameras?store_id=${encodeURIComponent(storeId)}&page=1&page_size=200`, {
            headers: headers()
        });
        if (!response.ok) {
            throw new Error("Unable to fetch cameras for this store");
        }

        const cameras = await response.json();
        const normalizedCameras = Array.isArray(cameras)
            ? cameras.filter((camera) => camera && camera.id != null)
            : [];

        if (normalizedCameras.length === 0) {
            cameraSelect.innerHTML = "<option value=''>No cameras found for this store</option>";
            return;
        }

        cameraSelect.innerHTML = normalizedCameras
            .map((camera) => `<option value="${camera.id}">${camera.camera_name || "Unnamed camera"} (ID: ${camera.id})</option>`)
            .join("");
        cameraSelect.disabled = false;
    } catch (error) {
        console.error(error);
        cameraSelect.innerHTML = "<option value=''>Camera list unavailable</option>";
        cameraSelect.disabled = true;
        setStatus("Could not load cameras for the selected store.", "err");
    }
}

if (storeSelect) {
    storeSelect.addEventListener("change", async (event) => {
        const selectedStore = event.target.value;
        await loadCamerasForStore(selectedStore);
    });
}

function renderCharts(labels, attentionData, dwellData) {
    if (typeof Chart === "undefined") {
        return;
    }

    const safeLabels = Array.isArray(labels) && labels.length ? labels : ["No data"];
    const safeAttention = Array.isArray(attentionData) ? attentionData : [];
    const safeDwell = Array.isArray(dwellData) ? dwellData : [];
    const attentionCanvas = document.getElementById("attentionChart");
    const dwellCanvas = document.getElementById("dwellChart");
    const attentionCtx = getCanvasContext("attentionChart");
    const dwellCtx = getCanvasContext("dwellChart");

    destroyCanvasChart(attentionCanvas, attentionChart);
    attentionChart = null;
    if (attentionCtx) {
        attentionChart = new Chart(attentionCtx, {
        type: "line",
        data: {
            labels: safeLabels,
            datasets: [
                {
                    label: "Attention Score",
                    data: safeAttention.length ? safeAttention : [0],
                    borderColor: "#205edb",
                    backgroundColor: "rgba(32, 94, 219, 0.14)",
                    borderWidth: 2,
                    fill: true,
                    tension: 0.35,
                    pointRadius: 1.7
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                y: { beginAtZero: true, max: 100 }
            }
        }
        });
    }

    destroyCanvasChart(dwellCanvas, dwellChart);
    dwellChart = null;
    if (dwellCtx) {
        dwellChart = new Chart(dwellCtx, {
        type: "bar",
        data: {
            labels: safeLabels,
            datasets: [
                {
                    label: "Dwell Time (seconds)",
                    data: safeDwell.length ? safeDwell : [0],
                    backgroundColor: "rgba(42, 156, 107, 0.65)",
                    borderColor: "#2a9c6b",
                    borderWidth: 1.2,
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                y: { beginAtZero: true }
            }
        }
        });
    }
}

if (videoForm) {
videoForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    clearStatus();

    const selectedStore = storeSelect ? storeSelect.value : "";
    const selectedCamera = cameraSelect ? cameraSelect.value : "";
    const file = videoFile && videoFile.files ? videoFile.files[0] : null;

    if (!selectedStore) {
        setStatus("Please select a store.", "err");
        return;
    }

    if (!selectedCamera) {
        setStatus("Please select a camera for the chosen store before uploading.", "err");
        return;
    }

    if (!file) {
        setStatus("Please upload a video file.", "err");
        return;
    }

    if (runBtn) {
        runBtn.disabled = true;
        runBtn.textContent = "Analyzing...";
    }
    setStatus("Uploading and processing video. This can take a minute...", "ok");

    try {
        const payload = new FormData();
        payload.append("store_id", selectedStore);
        payload.append("camera_id", selectedCamera);
        payload.append("video_file", file);
        payload.append("max_frames", String(maxFrames.value || 300));
        payload.append("conf_threshold", String(confThreshold.value || 0.25));

        const response = await fetch(`${window.API_BASE_URL}/analytics/video/analyze`, {
            method: "POST",
            headers: headers(),
            body: payload
        });

        const result = await response.json();
        if (!response.ok) {
            throw new Error(result.detail || "Video analytics failed");
        }

        const pipeline = result.pipeline || {};
        const metrics = result.metrics || {};
        const charts = result.charts || {};

        const processedFrames = safeNumber(pipeline.processed_frames || metrics.processed_frames);
        const analyticsRows = safeNumber(metrics.records || pipeline.analytics_saved || metrics.analytics_saved);

        if (mProcessed) mProcessed.textContent = processedFrames.toLocaleString();
        if (mRows) mRows.textContent = analyticsRows.toLocaleString();
        if (mAttention) mAttention.textContent = `${safeNumber(metrics.avg_attention_score).toFixed(1)}%`;
        if (mDwell) mDwell.textContent = safeNumber(metrics.avg_dwell_time).toFixed(2);

        renderCharts(
            Array.isArray(charts.labels) ? charts.labels : [],
            Array.isArray(charts.attention_series) ? charts.attention_series : [],
            Array.isArray(charts.dwell_series) ? charts.dwell_series : []
        );

        console.info("Video analysis API response URL:", result.video_url);
        await displayAnnotatedVideo(result.video_url);

        const generatedReports = Array.isArray(result.reports) ? result.reports.length : 0;
        localStorage.setItem("reports_store_id", String(result.store_id || selectedStore));
        setStatus(`Analysis complete. ${generatedReports || 5} dynamic reports are available on the Reports Dashboard.`, "ok");
    } catch (error) {
        console.error(error);
        setStatus(error.message || "Failed to analyze uploaded video.", "err");
    } finally {
        if (runBtn) {
            runBtn.disabled = false;
            runBtn.textContent = "Upload and Analyze";
        }
    }
});
}

loadStores();
