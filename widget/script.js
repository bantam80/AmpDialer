let leadQueue = [];
let currentIndex = 0;

// Initialize when ZOHO SDK is ready
ZOHO.embeddedApp.on("PageLoad", function(data) {
    console.log("AmpDialer Context Loaded:", data);
    
    // Check if we are already logged in
    const session = localStorage.getItem("amp_session");
    if (session) {
        showMainUI();
        if (data && data.cvid) {
            loadViewData(data.cvid);
        }
        fetchCustomViews();
    } else {
        showLogin();
    }
});

ZOHO.embeddedApp.init();

/* --- UI Toggle Helpers --- */
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
    const status = document.getElementById("login-status");

    status.innerText = "Authenticating...";

    try {
        const res = await fetch('/api/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, password })
        });
        const data = await res.json();

        if (data.access_token) {
            localStorage.setItem("amp_session", JSON.stringify(data));
            showMainUI();
            fetchCustomViews();
        } else {
            status.innerText = "Login failed: " + (data.error || "Check credentials");
        }
    } catch (err) {
        status.innerText = "Connection error: " + err.message;
    }
}

/* --- Zoho CRM Data Logic --- */
function fetchCustomViews() {
    ZOHO.CRM.API.getCustomViews({ Entity: "Leads" })
        .then(res => {
            const selector = document.getElementById("view-selector");
            selector.innerHTML = '<option value="">-- Switch View --</option>';
            res.custom_views.forEach(view => {
                let opt = document.createElement("option");
                opt.value = view.id;
                opt.innerHTML = view.display_value;
                selector.appendChild(opt);
            });
        });
}

function loadViewData(cvid) {
    ZOHO.CRM.API.getAllRecords({ Entity: "Leads", cvid: cvid })
        .then(res => {
            leadQueue = res.data || [];
            currentIndex = 0;
            updateLeadUI();
        });
}

function updateLeadUI() {
    if (leadQueue.length > 0 && currentIndex < leadQueue.length) {
        const lead = leadQueue[currentIndex];
        document.getElementById("entity-name").innerText = lead.Full_Name || "Unnamed Lead";
        document.getElementById("entity-phone").innerText = lead.Phone || lead.Mobile || "No Number";
        document.getElementById("queue-count").innerText = `Leads in Queue: ${leadQueue.length - currentIndex}`;
    }
}

/* --- Dialing via Connection --- */
async function initiateCall() {
    const lead = leadQueue[currentIndex];
    const phone = lead.Phone || lead.Mobile;
    const session = JSON.parse(localStorage.getItem("amp_session"));

    if (!phone) return alert("Lead has no phone number.");

    // Using your 'crmapi' connection name
    ZOHO.CRM.CONNECTOR.invoke("crmapi", {
        "url": "https://amp-dialer.vercel.app/api/dial",
        "method": "POST",
        "body": JSON.stringify({
            toNumber: phone,
            session: session
        })
    }).then(res => {
        console.log("Dial Response:", res);
        // Advance queue
        currentIndex++;
        updateLeadUI();
    });
}
