/* script.js - Debug & Troubleshooting Version */

let leadQueue = [];
let currentIndex = 0;

/**
 * UI Debugger: Prints messages directly to the widget UI
 */
function logDebug(label, data) {
    const panel = document.getElementById('debug-panel');
    if (!panel) return; // Fallback if panel isn't in HTML yet
    
    const entry = document.createElement('div');
    entry.className = 'debug-entry';
    const timestamp = new Date().toLocaleTimeString();
    
    let content = typeof data === 'object' ? JSON.stringify(data, null, 2) : data;
    entry.innerHTML = `<span class="debug-label">[${timestamp}] ${label}:</span> <pre style="margin:0; white-space:pre-wrap;">${content}</pre>`;
    panel.prepend(entry);
    console.log(`[DEBUG] ${label}:`, data);
}

/**
 * 1. SDK Event Listener
 * Zoho calls this when the iframe is ready and authorized.
 */
ZOHO.embeddedApp.on("PageLoad", function(data) {
    logDebug("PageLoad Data Received", data);
    
    const sessionStr = localStorage.getItem("amp_session");
    if (sessionStr) {
        logDebug("Auth Status", "Session found in localStorage. Loading UI...");
        showMainUI();
        
        // Auto-load if button was clicked from a specific view
        if (data && data.cvid) {
            logDebug("Context Action", `Auto-loading CVID from context: ${data.cvid}`);
            loadViewData(data.cvid);
        }
        
        fetchCustomViews();
    } else {
        logDebug("Auth Status", "No session found. Redirecting to login.");
        showLogin();
    }
});

/**
 * 2. Initialize the Handshake
 */
try {
    logDebug("System", "Starting ZOHO.embeddedApp.init()...");
    ZOHO.embeddedApp.init();
} catch (e) {
    logDebug("System Error", `Initialization failed: ${e.message}`);
}

/* --- Authentication --- */

async function performLogin() {
    const username = document.getElementById("login-user").value;
    const password = document.getElementById("login-pass").value;
    const statusDiv = document.getElementById("login-status");

    if (!username || !password) {
        logDebug("Login", "Attempted login with empty fields.");
        statusDiv.innerText = "Enter credentials.";
        return;
    }

    logDebug("Login", `Attempting login for: ${username}`);
    statusDiv.innerText = "Authenticating...";

    try {
        const res = await fetch('/api/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, password })
        });
        const data = await res.json();

        if (data.access_token) {
            logDebug("Login Success", "Token received. Storing session.");
            localStorage.setItem("amp_session", JSON.stringify(data));
            showMainUI();
            fetchCustomViews();
        } else {
            logDebug("Login Failed", data);
            statusDiv.innerText = "Login Failed: " + (data.error || "Bad Credentials");
        }
    } catch (e) {
        logDebug("Network Error", e.message);
        statusDiv.innerText = "API unreachable.";
    }
}

/* --- Zoho CRM Data Management --- */

function fetchCustomViews() {
    logDebug("Views", "Requesting ZOHO.CRM.API.getCustomViews for Leads...");
    
    ZOHO.CRM.API.getCustomViews({ Entity: "Leads" })
        .then(res => {
            logDebug("Views API Raw Response", res);
            const selector = document.getElementById("view-selector");
            selector.innerHTML = '<option value="">-- Select View --</option>';
            
            if (res.custom_views && res.custom_views.length > 0) {
                res.custom_views.forEach(view => {
                    let opt = document.createElement("option");
                    opt.value = view.id;
                    opt.innerHTML = view.display_value;
                    selector.appendChild(opt);
                });
                logDebug("Views", `Successfully populated ${res.custom_views.length} views.`);
            } else {
                logDebug("Views Warning", "API returned success, but custom_views array is empty or missing.");
            }
        })
        .catch(err => {
            logDebug("Views API Critical Error", err);
            // This usually indicates missing Scopes in the Connection
        });
}

function loadViewData(cvid) {
    if (!cvid) return;
    logDebug("Queue", `Fetching records for CVID: ${cvid}`);
    
    ZOHO.CRM.API.getAllRecords({ Entity: "Leads", cvid: cvid, sort_order: "asc" })
        .then(res => {
            logDebug("Records API Response", res);
            leadQueue = res.data || [];
            currentIndex = 0;
            
            if (leadQueue.length === 0) {
                logDebug("Queue Warning", "This view contains no records.");
            } else {
                logDebug("Queue", `Loaded ${leadQueue.length} records.`);
            }
            updateLeadUI();
        })
        .catch(err => {
            logDebug("Records API Error", err);
        });
}

function updateLeadUI() {
    const nameEl = document.getElementById("entity-name");
    const phoneEl = document.getElementById("entity-phone");
    const countEl = document.getElementById("queue-count");

    if (leadQueue.length > 0 && currentIndex < leadQueue.length) {
        const lead = leadQueue[currentIndex];
        // Use multiple fallbacks for the name
        const displayName = lead.Full_Name || `${lead.First_Name || ''} ${lead.Last_Name || ''}`.trim() || "Unnamed Lead";
        
        nameEl.innerText = displayName;
        phoneEl.innerText = lead.Phone || lead.Mobile || "No Number";
        countEl.innerText = `Leads: ${leadQueue.length - currentIndex}`;
        
        logDebug("UI Update", `Current Lead: ${displayName}`);
    } else {
        nameEl.innerText = "Queue Finished";
        phoneEl.innerText = "--";
        countEl.innerText = "Leads: 0";
    }
}

/* --- Dialer Execution --- */

async function initiateCall() {
    const lead = leadQueue[currentIndex];
    const sessionStr = localStorage.getItem("amp_session");

    if (!lead) {
        logDebug("Dialer Error", "No lead selected in queue.");
        return;
    }
    
    const phone = lead.Phone || lead.Mobile;
    if (!phone) {
        logDebug("Dialer Warning", "Skipping lead: No phone number.");
        alert("This lead has no number.");
        return;
    }

    const session = JSON.parse(sessionStr);
    logDebug("Dialer", `Requesting 'crmapi' connection to dial ${phone}...`);

    // Use your specific Connection Link Name: crmapi
    ZOHO.CRM.CONNECTOR.invoke("crmapi", {
        "url": "https://amp-dialer.vercel.app/api/dial",
        "method": "POST",
        "body": JSON.stringify({
            toNumber: phone,
            session: session
        })
    }).then(res => {
        logDebug("Dialer API Response", res);
        currentIndex++;
        updateLeadUI();
    }).catch(err => {
        logDebug("Connector Critical Error", err);
        alert("Zoho Connection 'crmapi' failed. Check Link Name and Scopes.");
    });
}

function skipLead() {
    logDebug("Queue", "Lead skipped by user.");
    currentIndex++;
    updateLeadUI();
}

/* --- UI Helpers --- */

function showMainUI() {
    document.getElementById("login-screen").style.display = "none";
    document.getElementById("main-ui").style.display = "block";
}

function showLogin() {
    document.getElementById("login-screen").style.display = "block";
    document.getElementById("main-ui").style.display = "none";
}
