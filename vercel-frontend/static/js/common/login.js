const form = document.getElementById("loginForm");

const dashboardRoutes = {
    admin: "/admin/dashboard",
    store_manager: "/store/dashboard",
    retail_analyst: "/retail/dashboard",
    marketing_analyst: "/marketing/dashboard"
};

if (form) {
    form.addEventListener("submit", async function (e) {

    e.preventDefault();

    const email = document.getElementById("email").value.trim();
    const password = document.getElementById("password").value;

    try {

        const response = await fetch(`${window.API_BASE_URL}/api/login`, {

            method: "POST",

            headers: {
                "Content-Type": "application/json"
            },

            body: JSON.stringify({
                email: email,
                password: password
            })

        });

        const result = await response.json();

        console.log("Login Response:", result);

        if (response.ok) {

            // Store JWT token
            localStorage.setItem("access_token", result.access_token);

            // Store user information
            localStorage.setItem("role", result.role);
            localStorage.setItem("full_name", result.full_name);

            console.log("Stored Full Name:", localStorage.getItem("full_name"));

            alert("Login Successful");

            const dashboardUrl = dashboardRoutes[result.role];
            if (dashboardUrl) {
                window.location.href = dashboardUrl;
            } else {
                alert("Unknown user role.");
            }

        } else {

            alert(result.detail || "Invalid email or password");

        }

    } catch (error) {

        console.error("Login Error:", error);
        alert("Server Error");

    }

    });
}


const googleBtn = document.getElementById("googleLoginBtn");

if (googleBtn) {

    googleBtn.addEventListener("click", function (e) {

        e.preventDefault();

        // Redirect to FastAPI Google OAuth endpoint
        window.location.href = `${window.API_BASE_URL}/api/auth/google/login`;

    });

}
