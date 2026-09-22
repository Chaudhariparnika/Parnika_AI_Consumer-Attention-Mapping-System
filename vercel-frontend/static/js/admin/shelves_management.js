const tableBody = document.getElementById("shelfTableBody");
const modal = document.getElementById("addShelfModal");
const form = document.getElementById("shelfForm");
const messageBox = document.getElementById("shelfMessage");
const pageMessageBox = document.getElementById("pageMessage");
const searchInput = document.getElementById("searchShelf");
const statusFilter = document.getElementById("statusFilter");
const applyFilterBtn = document.getElementById("applyFilterBtn");
const addShelfBtn = document.getElementById("addShelfBtn");
const closeModalBtn = document.getElementById("closeModal");
const modalTitle = document.getElementById("modalTitle");

let editingShelfId = null;
let allShelves = [];

function normalizeText(value) {
    return String(value ?? "").trim().toLowerCase();
}

function getHeaders() {
    const token = localStorage.getItem("access_token");
    const headers = { "Content-Type": "application/json" };
    if (token) {
        headers.Authorization = `Bearer ${token}`;
    }
    return headers;
}

function showMessage(text, type = "success") {
    messageBox.classList.remove("hidden", "bg-red-100", "text-red-700", "bg-green-100", "text-green-700");
    if (type === "error") {
        messageBox.classList.add("bg-red-100", "text-red-700");
    } else {
        messageBox.classList.add("bg-green-100", "text-green-700");
    }
    messageBox.textContent = text;
}

function clearMessage() {
    messageBox.classList.add("hidden");
    messageBox.textContent = "";
}

function showPageMessage(text, type = "success") {
    if (!pageMessageBox) {
        return;
    }
    pageMessageBox.classList.remove("hidden", "bg-red-100", "text-red-700", "bg-green-100", "text-green-700");
    if (type === "error") {
        pageMessageBox.classList.add("bg-red-100", "text-red-700");
    } else {
        pageMessageBox.classList.add("bg-green-100", "text-green-700");
    }
    pageMessageBox.textContent = text;
}

function openModal(isEdit = false) {
    modal.classList.remove("hidden");
    modal.classList.add("flex");
    modalTitle.textContent = isEdit ? "Edit Shelf" : "Add New Shelf";
}

function closeModal() {
    modal.classList.add("hidden");
    modal.classList.remove("flex");
    editingShelfId = null;
    form.reset();
    clearMessage();
}

function escapeHtml(value) {
    return String(value ?? "")
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#039;");
}

function getStatusColor(status) {
    switch ((status || "").toLowerCase()) {
        case "active":
        case "available":
            return "bg-green-100 text-green-700";
        case "occupied":
            return "bg-red-100 text-red-700";
        case "maintenance":
            return "bg-yellow-100 text-yellow-700";
        default:
            return "bg-gray-100 text-gray-700";
    }
}

function getFilteredShelves() {
    const search = normalizeText(searchInput.value || "");
    const status = normalizeText(statusFilter.value || "");

    return allShelves.filter((shelf) => {
        const text = [
            shelf.id,
            shelf.shelf_name,
            shelf.shelf_number,
            shelf.store_id,
            shelf.category,
            shelf.aisle,
            shelf.capacity,
            shelf.status,
        ].join(" ").toLowerCase();

        const shelfStatus = normalizeText(shelf.status);

        const matchesSearch = !search || text.includes(search);
        const matchesStatus = !status || shelfStatus === status || shelfStatus.includes(status);
        return matchesSearch && matchesStatus;
    });
}

function renderShelves() {
    const shelves = getFilteredShelves();
    if (!shelves.length) {
        tableBody.innerHTML = `
            <tr>
                <td colspan="10" class="px-4 py-8 text-center text-slate-500">No shelves found for current filters.</td>
            </tr>
        `;
        return;
    }

    tableBody.innerHTML = shelves.map((shelf) => {
        const createdAt = shelf.created_at ? new Date(shelf.created_at).toLocaleDateString() : "-";
        return `
            <tr class="border-b hover:bg-slate-50">
                <td class="px-4 py-3">${escapeHtml(shelf.id)}</td>
                <td class="px-4 py-3">${escapeHtml(shelf.shelf_name)}</td>
                <td class="px-4 py-3">${escapeHtml(shelf.shelf_number)}</td>
                <td class="px-4 py-3">${escapeHtml(shelf.store_id)}</td>
                <td class="px-4 py-3">${escapeHtml(shelf.category)}</td>
                <td class="px-4 py-3">${escapeHtml(shelf.aisle)}</td>
                <td class="px-4 py-3">${escapeHtml(shelf.capacity)}</td>
                <td class="px-4 py-3">
                    <span class="px-3 py-1 rounded-full ${getStatusColor(shelf.status)}">${escapeHtml(shelf.status || "-")}</span>
                </td>
                <td class="px-4 py-3">${createdAt}</td>
                <td class="px-4 py-3 text-center">
                    <button class="bg-yellow-500 hover:bg-yellow-600 text-white px-3 py-2 rounded" data-action="edit" data-id="${shelf.id}">Edit</button>
                    <button class="bg-red-600 hover:bg-red-700 text-white px-3 py-2 rounded ml-2" data-action="delete" data-id="${shelf.id}">Delete</button>
                </td>
            </tr>
        `;
    }).join("");
}

async function loadShelves() {
    try {
        const response = await fetch(`${window.API_BASE_URL}/api/shelves/`, { headers: getHeaders() });

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`HTTP ${response.status}: ${errorText}`);
        }

        const data = await response.json();

        // Handle both direct arrays [...] AND wrapped objects like { data: [...] } or { shelves: [...] }
        const shelvesArray = Array.isArray(data) ? data : (data.shelves || data.data || []);

        // Sort rows stably
        allShelves = shelvesArray.sort((a, b) => {
            const idA = Number.parseInt(a.id, 10);
            const idB = Number.parseInt(b.id, 10);
            if (Number.isInteger(idA) && Number.isInteger(idB)) {
                return idA - idB;
            }
            return normalizeText(a.shelf_name).localeCompare(normalizeText(b.shelf_name));
        });

        renderShelves();
    } catch (error) {
        console.error("Failed to load shelves:", error);
        tableBody.innerHTML = `
            <tr>
                <td colspan="10" class="px-4 py-8 text-center text-red-600">
                    Unable to load shelves. (${escapeHtml(error.message)})
                </td>
            </tr>
        `;
    }
}

// Ensure DOM is fully loaded before executing API calls
document.addEventListener("DOMContentLoaded", () => {
    loadShelves();
});

function getFormPayload() {
    return {
        shelf_name: document.getElementById("shelf_name").value.trim(),
        shelf_number: document.getElementById("shelf_number").value.trim(),
        store_id: Number.parseInt(document.getElementById("store_id").value, 10),
        category: document.getElementById("category").value.trim(),
        aisle: document.getElementById("aisle").value.trim(),
        capacity: Number.parseInt(document.getElementById("capacity").value, 10),
        status: document.getElementById("status").value,
    };
}

function isValidPayload(payload) {
    if (!payload.shelf_name || !payload.shelf_number || !payload.category || !payload.aisle || !payload.status) {
        showMessage("Please fill all required fields.", "error");
        return false;
    }
    if (!Number.isInteger(payload.store_id) || payload.store_id <= 0) {
        showMessage("Store ID must be a positive number.", "error");
        return false;
    }
    if (!Number.isInteger(payload.capacity) || payload.capacity < 0) {
        showMessage("Capacity must be zero or a positive number.", "error");
        return false;
    }
    return true;
}

async function createOrUpdateShelf(event) {
    event.preventDefault();
    clearMessage();
    const isEdit = Boolean(editingShelfId);

    const payload = getFormPayload();
    if (!isValidPayload(payload)) {
        return;
    }

    const url = editingShelfId ? `${window.API_BASE_URL}/api/shelves/${editingShelfId}` : `${window.API_BASE_URL}/api/shelves/`;
    const method = editingShelfId ? "PUT" : "POST";

    try {
        const response = await fetch(url, {
            method,
            headers: getHeaders(),
            body: JSON.stringify(payload),
        });

        const result = await response.json();
        if (!response.ok) {
            throw new Error(result.detail || "Request failed");
        }

        closeModal();
        await loadShelves();
        showPageMessage(isEdit ? "Shelf updated successfully." : "Shelf added successfully.", "success");
    } catch (error) {
        console.error(error);
        showMessage(error.message || "Unable to save shelf.", "error");
    }
}

async function startEditShelf(id) {
    try {
        const response = await fetch(`${window.API_BASE_URL}/api/shelves/${id}`, { headers: getHeaders() });
        if (!response.ok) {
            throw new Error(await response.text());
        }

        const shelf = await response.json();
        editingShelfId = id;
        document.getElementById("shelf_name").value = shelf.shelf_name || "";
        document.getElementById("shelf_number").value = shelf.shelf_number || "";
        document.getElementById("store_id").value = shelf.store_id ?? "";
        document.getElementById("category").value = shelf.category || "";
        document.getElementById("aisle").value = shelf.aisle || "";
        document.getElementById("capacity").value = shelf.capacity ?? 0;
        document.getElementById("status").value = shelf.status || "Active";
        openModal(true);
    } catch (error) {
        console.error(error);
        alert("Unable to load shelf details.");
    }
}

async function removeShelf(id) {
    if (!window.confirm("Delete this shelf?")) {
        return;
    }

    try {
        const response = await fetch(`${window.API_BASE_URL}/api/shelves/${id}`, {
            method: "DELETE",
            headers: getHeaders(),
        });

        if (!response.ok) {
            throw new Error(await response.text());
        }

        await loadShelves();
        showPageMessage("Shelf deleted successfully.", "success");
    } catch (error) {
        console.error(error);
        showPageMessage("Delete failed.", "error");
    }
}

addShelfBtn.addEventListener("click", () => {
    editingShelfId = null;
    form.reset();
    document.getElementById("status").value = "Active";
    clearMessage();
    openModal(false);
});

closeModalBtn.addEventListener("click", closeModal);
form.addEventListener("submit", createOrUpdateShelf);

searchInput.addEventListener("input", renderShelves);
statusFilter.addEventListener("change", renderShelves);
applyFilterBtn.addEventListener("click", renderShelves);

tableBody.addEventListener("click", (event) => {
    const actionButton = event.target.closest("button[data-action]");
    if (!actionButton) {
        return;
    }

    const id = Number.parseInt(actionButton.dataset.id, 10);
    const action = actionButton.dataset.action;

    if (!Number.isInteger(id)) {
        return;
    }

    if (action === "edit") {
        startEditShelf(id);
    }
    if (action === "delete") {
        removeShelf(id);
    }
});

modal.addEventListener("click", (event) => {
    if (event.target === modal) {
        closeModal();
    }
});

loadShelves();
