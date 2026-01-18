/* script.js - AmpDialer Zoho CRM Widget */

let leadQueue = [];
let currentIndex = 0;

// Initialize the SDK and define the PageLoad event
ZOHO.embeddedApp.on("PageLoad", function(data) {
    console.log("AmpDialer Widget Loaded. Context:", data);
    
    // Check if a session already exists in the browser
    const sessionStr = localStorage.getItem("amp_session");
    if (sessionStr) {
        try {
            const session = JSON.parse(sessionStr);
            if (session && session.access_token) {
                showMainUI();
                // If button was pressed from a specific view, load it
                if (data && data.cvid) {
                    loadViewData(data.cvid);
                }
                fetchCustomViews();
                return;
            }
        } catch (e) {
            console.error("Session parse error:", e);
        }
    }
    showLogin();
});

// Start the Zoho Embedded App
ZOHO.embeddedApp.init();

/* --- UI State Management --- */

function showMainUI() {
    document.getElementById("login-screen").style.display = "none";
    document.getElementById("main-ui").style.display = "block";
}

function showLogin() {
    document.getElementById("login-screen").style.display = "block";
    document.getElementById("main-ui").style.display = "none";
}

/* --- Authentication --- */

async function performLogin() {
    const username = document.getElementById("login-user").value;
    const password = document.getElementById("login-pass").value;
    const statusDiv = document.getElementById("login-status");

    if (!username || !password) {
        statusDiv.innerText = "Please enter all credentials.";
        return;
    }

    statusDiv.innerText = "Connecting to Gateway...";

    try {
        const res = await fetch('/api/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, password })
        });
        
        const data = await res.json();

        if (data.access_token) {
            // Save the full RingLogix session object
            localStorage.setItem("amp_session", JSON.stringify(data));
            showMainUI();
            fetchCustomViews();
        } else {
            statusDiv.innerText = "Login failed: " + (data.error_description || "Check credentials");
        }
    } catch (err) {
        statusDiv.innerText = "Network error during login.";
        console.error("Login Error:", err);
    }
}

/* --- Lead & View Management --- */

function fetchCustomViews() {
    ZOHO.CRM.API.getCustomViews({ Entity: "Leads" })
        .then(res => {
            const selector = document.getElementById("view-selector");
            selector.innerHTML = '<option value="">-- Switch View --</option>';
            if (res.custom_views) {
                res.custom_views.forEach(view => {
                    let opt = document.createElement("option");
                    opt.value = view.id;
                    opt.innerHTML = view.display_value;
                    selector.appendChild(opt);
                });
            }
        });
}

function loadViewData(cvid) {
    if (!cvid) return;
    
    const countLabel = document.getElementById("queue-count");
    countLabel.innerText = "Loading leads...";

    ZOHO.CRM.API.getAllRecords({ Entity: "Leads", cvid: cvid, sort_order: "asc" })
        .then(res => {
            leadQueue = res.data || [];
            currentIndex = 0;
            updateLeadDisplay();
        });
}

function updateLeadDisplay() {
    const nameEl = document.getElementById("entity-name");
    const phoneEl = document.getElementById("entity-phone");
    const countEl = document.getElementById("queue-count");

    if (leadQueue.length > 0 && currentIndex < leadQueue.length) {
        const lead = leadQueue[currentIndex];
        nameEl.innerText = lead.Full_Name || "Unnamed Lead";
        phoneEl.innerText = lead.Phone || lead.Mobile || "No Number Found";
        countEl.innerText = `Leads in Queue: ${leadQueue.length - currentIndex}`;
    } else {
        nameEl.innerText = "Queue Finished";
        phoneEl.innerText = "--";
        countEl.innerText = "Leads in Queue: 0";
    }
}

function skipLead() {
    if (currentIndex < leadQueue.length - 1) {
        currentIndex++;
        updateLeadDisplay();
    } else {
        alert("End of queue reached.");
    }
}

/* --- Calling Logic via CRM Connection --- */

async function initiateCall() {
    // Safety check to prevent "Cannot read properties of undefined"
    if (!leadQueue || leadQueue.length === 0 || !leadQueue[currentIndex]) {
        alert("Please select a view with valid leads first.");
        return;
    }

    const lead = leadQueue[currentIndex];
    const phone = lead.Phone || lead.Mobile;
    const sessionStr = localStorage.getItem("amp_session");

    if (!phone || phone === "No Number Found") {
        alert("This lead does not have a valid phone number.");
        return;
    }

    if (!sessionStr) {
        showLogin();
        return;
    }

    const session = JSON.parse(sessionStr);

    // Use your verified Connection Link Name 'crmapi'
    ZOHO.CRM.CONNECTOR.invoke("crmapi", {
        "url": "https://amp-dialer.vercel.app/api/dial",
        "method": "POST",
        "body": JSON.stringify({
            toNumber: phone,
            session: session
        })
    }).then(res => {
        console.log("Dialer Response:", res);
        // Automatically move to the next lead on success
        currentIndex++;
        updateLeadDisplay();
    }).catch(err => {
        alert("Dialer Connection Error. Check Zoho CRM 'crmapi' settings.");
        console.error("Connector Error:", err);
    });
}
