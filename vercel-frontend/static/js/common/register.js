const form = document.getElementById("registerForm");

form.addEventListener("submit", async function (e) {

    e.preventDefault();

    const full_name = document.getElementById("full_name").value.trim();
    const email = document.getElementById("email").value.trim();
    const password = document.getElementById("password").value;
    const confirm_password = document.getElementById("confirm_password").value;
    const role = document.getElementById("role").value;

    // Validate fields
    if (!full_name || !email || !password || !confirm_password || !role) {
        alert("Please fill all fields.");
        return;
    }

    // Password validation
    if (password !== confirm_password) {
        alert("Passwords do not match.");
        return;
    }

    // Data to send to FastAPI
    const userData = {
        full_name: full_name,
        email: email,
        password: password,
        role: role
    };

    try {

        const response = await fetch(`${window.API_BASE_URL}/api/register`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify(userData)
        });

        const result = await response.json();

        console.log("Status:", response.status);
        console.log("Response:", result);

        if (response.ok) {

            alert("Registration Successful!");

            // Redirect to login page
            window.location.href = "/login";

        } else {

            alert(result.detail || "Registration Failed");

        }

    } catch (error) {

        console.error("Error:", error);
        alert("Server Error");

    }

});
