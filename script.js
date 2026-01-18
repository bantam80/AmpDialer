let leadQueue = [];
let currentIndex = 0;

// Initialize Zoho SDK
ZOHO.embeddedApp.on("PageLoad", function(data) {
    const session = localStorage.getItem("amp_session");
    if (session) {
        showMainUI();
        fetchCustomViews();
        if (data && data.cvid) loadViewData(data.cvid);
    } else {
        showLogin();
    }
});

ZOHO.embeddedApp.init();

/* --- API CALLS --- */

function fetchCustomViews() {
    // Verified working in your Deluge diagnostic
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
    ZOHO.CRM.API.getAllRecords({ Entity: "Leads", cvid: cvid })
        .then(res => {
            leadQueue = res.data || [];
            currentIndex = 0;
            updateLeadUI();
        });
}

/* --- UI & ACTIONS --- */

function updateLeadUI() {
    if (leadQueue.length > 0 && currentIndex < leadQueue.length) {
        const lead = leadQueue[currentIndex];
        document.getElementById("entity-name").innerText = lead.Full_Name || "Unnamed Lead";
        document.getElementById("entity-phone").innerText = lead.Phone || lead.Mobile || "No Number";
        document.getElementById("queue-count").innerText = `Queue: ${leadQueue.length - currentIndex}`;
    }
}

async function performLogin() {
    const user = document.getElementById("login-user").value;
    const pass = document.getElementById("login-pass").value;
    const status = document.getElementById("login-status");

    status.innerText = "Authenticating...";

    try {
        const res = await fetch('/api/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username: user, password: pass })
        });
        const data = await res.json();

        if (data.access_token) {
            localStorage.setItem("amp_session", JSON.stringify(data));
            showMainUI();
            fetchCustomViews();
        } else {
            status.innerText = "Error: " + (data.error || "Login Failed");
        }
    } catch (e) {
        status.innerText = "Network Error";
    }
}

async function initiateCall() {
    const lead = leadQueue[currentIndex];
    const session = JSON.parse(localStorage.getItem("amp_session"));
    
    // Using 'crmapi' connection validated in Deluge
    ZOHO.CRM.CONNECTOR.invoke("crmapi", {
        "url": "https://amp-dialer.vercel.app/api/dial",
        "method": "POST",
        "body": JSON.stringify({ toNumber: lead.Phone || lead.Mobile, session: session })
    }).then(res => {
        currentIndex++;
        updateLeadUI();
    });
}

function skipLead() { currentIndex++; updateLeadUI(); }
function showMainUI() { 
    document.getElementById("login-screen").style.display = "none"; 
    document.getElementById("main-ui").style.display = "block"; 
}
function showLogin() { 
    document.getElementById("login-screen").style.display = "block"; 
    document.getElementById("main-ui").style.display = "none"; 
}
