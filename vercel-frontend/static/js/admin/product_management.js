const token = localStorage.getItem("access_token");
const API = `${window.API_BASE_URL}/api/products`;
const STORES_API = `${window.API_BASE_URL}/api/production/stores?page=1&page_size=200`;
const SHELVES_API = `${window.API_BASE_URL}/api/production/shelves?page=1&page_size=200`;

let stores = [];
let shelves = [];
let currentItems = [];
let currentPage = 1;
let pageSize = 10;
let totalItems = 0;
let productSummary = { active_products: 0, low_stock_products: 0, out_of_stock_products: 0 };
let editingId = null;
let deleteId = null;

if (!token) {
  window.location.href = "/login";
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
    throw new Error(payload.detail || "Request failed");
  }

  return response.status === 204 ? null : response.json();
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

function statusBadge(status) {
  const normalized = (status || "Inactive").trim();
  if (normalized === "Active") {
    return '<span class="inline-flex rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-semibold text-emerald-700">Active</span>';
  }
  return '<span class="inline-flex rounded-full bg-amber-100 px-2.5 py-1 text-xs font-semibold text-amber-700">Inactive</span>';
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function buildQuery() {
  const params = new URLSearchParams();
  params.set("page", String(currentPage));
  params.set("page_size", String(pageSize));

  const search = document.getElementById("searchInput").value.trim();
  const category = document.getElementById("categoryFilter").value;
  const storeId = document.getElementById("storeFilter").value;
  const shelfId = document.getElementById("shelfFilter").value;
  const status = document.getElementById("statusFilter").value;

  if (search) params.set("search", search);
  if (category) params.set("category", category);
  if (storeId) params.set("store_id", storeId);
  if (shelfId) params.set("shelf_id", shelfId);
  if (status) params.set("status", status);

  return params.toString();
}

function renderTable() {
  const body = document.getElementById("productTable");

  if (!currentItems.length) {
    body.innerHTML = '<tr><td colspan="9" class="px-3 py-8 text-center text-sm text-slate-500">No products found.</td></tr>';
    return;
  }

  body.innerHTML = currentItems
    .map((item) => {
      const id = Number(item.id);
      return `
      <tr>
        <td><strong>${escapeHtml(item.name)}</strong></td>
        <td>${escapeHtml(item.sku)}</td>
        <td>${escapeHtml(item.category || "General")}</td>
        <td>${escapeHtml(item.store_name || "-")}</td>
        <td>${escapeHtml(item.shelf_name || "-")}</td>
        <td>${Number(item.price || 0).toFixed(2)}</td>
        <td>${item.stock_quantity ?? 0}</td>
        <td>${statusBadge(item.status)}</td>
        <td>
          <button class="rounded-md border border-slate-300 bg-slate-50 px-2.5 py-1 text-xs font-semibold text-slate-700" data-action="view" data-id="${id}">View</button>
          <button class="ml-1 rounded-md border border-slate-300 bg-slate-50 px-2.5 py-1 text-xs font-semibold text-slate-700" data-action="edit" data-id="${id}">Edit</button>
          <button class="ml-1 rounded-md bg-red-600 px-2.5 py-1 text-xs font-semibold text-white" data-action="delete" data-id="${id}">Delete</button>
        </td>
      </tr>`;
    })
    .join("");
}

function renderKpis() {
  document.getElementById("totalProducts").textContent = String(totalItems);
  document.getElementById("activeProducts").textContent = String(productSummary.active_products || 0);
  document.getElementById("lowStock").textContent = String(productSummary.low_stock_products || 0);
  document.getElementById("outStock").textContent = String(productSummary.out_of_stock_products || 0);
}

function renderPageMeta() {
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
  document.getElementById("pageMeta").textContent = `Page ${currentPage} of ${totalPages} (${totalItems} items)`;
  document.getElementById("prevPageBtn").disabled = currentPage <= 1;
  document.getElementById("nextPageBtn").disabled = currentPage >= totalPages;
}

function populateStoreAndShelfOptions() {
  const storeFilter = document.getElementById("storeFilter");
  const shelfFilter = document.getElementById("shelfFilter");
  const storeSelect = document.getElementById("store");
  const shelfSelect = document.getElementById("shelf");

  const storeOptions = stores.map((store) => `<option value="${store.id}">${escapeHtml(store.store_name)}</option>`).join("");
  const shelfOptions = shelves.map((shelf) => `<option value="${shelf.id}" data-store-id="${shelf.store_id}">${escapeHtml(shelf.shelf_name)}</option>`).join("");

  storeFilter.innerHTML = '<option value="">All</option>' + storeOptions;
  shelfFilter.innerHTML = '<option value="">All</option>' + shelfOptions;

  storeSelect.innerHTML = '<option value="">Select Store</option>' + storeOptions;
  shelfSelect.innerHTML = '<option value="">Select Shelf</option>' + shelfOptions;
}

function populateCategoryFilter() {
  const categories = [...new Set(currentItems.map((item) => item.category).filter(Boolean))].sort();
  const categoryFilter = document.getElementById("categoryFilter");
  const current = categoryFilter.value;
  categoryFilter.innerHTML = '<option value="">All</option>' + categories.map((cat) => `<option value="${escapeHtml(cat)}">${escapeHtml(cat)}</option>`).join("");
  categoryFilter.value = current;
}

function filterShelfOptionsByStore() {
  const selectedStoreId = document.getElementById("store").value;
  const shelfSelect = document.getElementById("shelf");
  const options = ['<option value="">Select Shelf</option>'];

  shelves.forEach((shelf) => {
    if (!selectedStoreId || String(shelf.store_id) === String(selectedStoreId)) {
      options.push(`<option value="${shelf.id}">${escapeHtml(shelf.shelf_name)}</option>`);
    }
  });

  shelfSelect.innerHTML = options.join("");
}

function fillProductForm(item) {
  document.getElementById("productName").value = item?.name || "";
  document.getElementById("sku").value = item?.sku || "";
  document.getElementById("barcode").value = item?.barcode || "";
  document.getElementById("brand").value = item?.brand || "";
  document.getElementById("category").value = item?.category || "General";
  document.getElementById("price").value = item?.price ?? 0;
  document.getElementById("stock").value = item?.stock_quantity ?? 0;
  document.getElementById("status").value = item?.status || "Active";
  document.getElementById("store").value = item?.store_id || "";
  filterShelfOptionsByStore();
  document.getElementById("shelf").value = item?.shelf_id || "";
  document.getElementById("imageUrl").value = item?.image_url || "";
  document.getElementById("description").value = item?.description || "";
}

function openViewModal(item) {
  document.getElementById("viewContent").innerHTML = `
    <p><strong>Name:</strong> ${escapeHtml(item.name)}</p>
    <p><strong>SKU:</strong> ${escapeHtml(item.sku)}</p>
    <p><strong>Category:</strong> ${escapeHtml(item.category || "General")}</p>
    <p><strong>Store:</strong> ${escapeHtml(item.store_name || "-")}</p>
    <p><strong>Shelf:</strong> ${escapeHtml(item.shelf_name || "-")}</p>
    <p><strong>Price:</strong> ${Number(item.price || 0).toFixed(2)}</p>
    <p><strong>Stock:</strong> ${item.stock_quantity ?? 0}</p>
    <p><strong>Status:</strong> ${escapeHtml(item.status || "Inactive")}</p>
    <p><strong>Barcode:</strong> ${escapeHtml(item.barcode || "-")}</p>
    <p><strong>Brand:</strong> ${escapeHtml(item.brand || "-")}</p>
    <p><strong>Description:</strong> ${escapeHtml(item.description || "-")}</p>
  `;
  openModal("viewModal");
}

async function fetchLookupData() {
  const [storesResult, shelvesResult] = await Promise.allSettled([
    request(STORES_API),
    request(SHELVES_API),
  ]);

  stores = storesResult.status === "fulfilled" && Array.isArray(storesResult.value)
    ? storesResult.value
    : [];
  shelves = shelvesResult.status === "fulfilled" && Array.isArray(shelvesResult.value)
    ? shelvesResult.value
    : [];

  populateStoreAndShelfOptions();
}

async function fetchProducts() {
  const query = buildQuery();
  const payload = await request(`${API}?${query}`);
  currentItems = payload.items || [];
  totalItems = payload.total || 0;
  productSummary = payload.summary || productSummary;
  renderTable();
  renderKpis();
  renderPageMeta();
  populateCategoryFilter();
}

async function refreshAll() {
  try {
    await fetchProducts();
  } catch (error) {
    document.getElementById("productTable").innerHTML = `<tr><td colspan="9" class="px-3 py-8 text-center text-sm text-red-600">${escapeHtml(error.message)}</td></tr>`;
  }
}

function collectPayload() {
  return {
    name: document.getElementById("productName").value.trim(),
    sku: document.getElementById("sku").value.trim(),
    barcode: document.getElementById("barcode").value.trim() || null,
    brand: document.getElementById("brand").value.trim() || null,
    category: document.getElementById("category").value.trim() || "General",
    price: Number(document.getElementById("price").value || 0),
    stock_quantity: Number(document.getElementById("stock").value || 0),
    status: document.getElementById("status").value,
    store_id: Number(document.getElementById("store").value),
    shelf_id: Number(document.getElementById("shelf").value),
    image_url: document.getElementById("imageUrl").value.trim() || null,
    description: document.getElementById("description").value.trim() || null,
  };
}

async function onSubmitForm(event) {
  event.preventDefault();
  const payload = collectPayload();

  if (!payload.name || !payload.sku || !payload.store_id || !payload.shelf_id) {
    alert("Name, SKU, Store, and Shelf are required.");
    return;
  }

  try {
    if (editingId) {
      await request(`${API}/${editingId}`, {
        method: "PUT",
        body: JSON.stringify(payload),
      });
    } else {
      await request(API, {
        method: "POST",
        body: JSON.stringify(payload),
      });
    }
    closeModal("productModal");
    editingId = null;
    currentPage = 1;
    await refreshAll();
  } catch (error) {
    alert(error.message);
  }
}

async function confirmDelete() {
  if (!deleteId) return;
  try {
    await request(`${API}/${deleteId}`, { method: "DELETE" });
    closeModal("deleteModal");
    deleteId = null;
    if ((currentPage - 1) * pageSize >= Math.max(totalItems - 1, 0) && currentPage > 1) {
      currentPage -= 1;
    }
    await refreshAll();
  } catch (error) {
    alert(error.message);
  }
}

function onTableActionClick(event) {
  const target = event.target.closest("button[data-action]");
  if (!target) return;

  const id = Number(target.getAttribute("data-id"));
  const action = target.getAttribute("data-action");
  const item = currentItems.find((entry) => entry.id === id);
  if (!item) return;

  if (action === "view") {
    openViewModal(item);
    return;
  }

  if (action === "edit") {
    editingId = id;
    document.getElementById("productModalTitle").textContent = "Edit Product";
    fillProductForm(item);
    openModal("productModal");
    return;
  }

  if (action === "delete") {
    deleteId = id;
    openModal("deleteModal");
  }
}

function resetFilters() {
  document.getElementById("searchInput").value = "";
  document.getElementById("categoryFilter").value = "";
  document.getElementById("storeFilter").value = "";
  document.getElementById("shelfFilter").value = "";
  document.getElementById("statusFilter").value = "";
  currentPage = 1;
  refreshAll();
}

function setupEvents() {
  document.getElementById("addProductBtn").addEventListener("click", () => {
    editingId = null;
    document.getElementById("productModalTitle").textContent = "Add Product";
    document.getElementById("productForm").reset();
    fillProductForm(null);
    openModal("productModal");
  });

  document.getElementById("store").addEventListener("change", filterShelfOptionsByStore);
  document.getElementById("productForm").addEventListener("submit", onSubmitForm);
  document.getElementById("confirmDeleteBtn").addEventListener("click", confirmDelete);
  document.getElementById("productTable").addEventListener("click", onTableActionClick);

  document.getElementById("searchInput").addEventListener("input", () => {
    currentPage = 1;
    refreshAll();
  });

  ["categoryFilter", "storeFilter", "shelfFilter", "statusFilter"].forEach((id) => {
    document.getElementById(id).addEventListener("change", () => {
      currentPage = 1;
      refreshAll();
    });
  });

  document.getElementById("resetFiltersBtn").addEventListener("click", resetFilters);

  document.getElementById("prevPageBtn").addEventListener("click", async () => {
    if (currentPage <= 1) return;
    currentPage -= 1;
    await refreshAll();
  });

  document.getElementById("nextPageBtn").addEventListener("click", async () => {
    const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
    if (currentPage >= totalPages) return;
    currentPage += 1;
    await refreshAll();
  });

  document.querySelectorAll("[data-close]").forEach((button) => {
    button.addEventListener("click", () => {
      closeModal(button.getAttribute("data-close"));
    });
  });

  document.querySelectorAll(".modal").forEach((modal) => {
    modal.addEventListener("click", (event) => {
      if (event.target === modal) {
        closeModal(modal.id);
      }
    });
  });
}

async function boot() {
  setupEvents();
  try {
    await fetchLookupData();
  } catch (error) {
    console.warn("Lookup endpoints failed, continuing with product list:", error);
  }
  await refreshAll();
}

boot();
