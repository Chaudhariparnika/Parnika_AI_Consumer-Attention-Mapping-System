const token = localStorage.getItem("access_token");

if (!token) window.location.href = "/login";

function setText(id, value) {
    const element = document.getElementById(id);
    if (element) element.textContent = value;
}

function setKpis(value) {
    ["totalUsers", "totalStores", "totalCameras", "totalShelves", "totalProducts"]
        .forEach((id) => setText(id, value));
}

document.addEventListener("DOMContentLoaded", async () => {
    try {
        const response = await fetch(`${window.API_BASE_URL}/api/dashboard/admin-overview`, {
            headers: {
                Authorization: `Bearer ${token}`
            }
        });

        if (response.status === 401 || response.status === 403) {
            setKpis("Unavailable");
            return;
        }
        if (!response.ok) {
            throw new Error("Failed to load administrative data");
        }

        const payload = await response.json();
        const kpis = payload.kpis || {};
        ["total_users", "total_stores", "total_cameras", "total_shelves", "total_products"]
            .forEach((key) => setText(key.replace(/_(.)/g, (_, character) => character.toUpperCase()), kpis[key] ?? "—"));
    } catch (error) {
        console.error(error);
        setKpis("Unavailable");
    }
});

document.getElementById("logoutBtn").addEventListener("click", () => {
    localStorage.removeItem("access_token");
    localStorage.removeItem("full_name");
    localStorage.removeItem("role");
    document.cookie = "access_token=; Max-Age=0; Path=/; SameSite=Lax";
    window.location.href = "/login";
});
