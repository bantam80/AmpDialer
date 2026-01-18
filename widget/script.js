/* script.js - Final Deployment Version */

let leadQueue = [];
let currentIndex = 0;

// Utility to print logs directly to the debug-panel in index.html
function logDebug(label, data) {
    const panel = document.getElementById('debug-panel');
    if (!panel) return;
    const entry = document.createElement('div');
    const time = new Date().toLocaleTimeString();
    let content = typeof data === 'object' ? JSON.stringify(data, null, 2) : data;
    entry.innerHTML = `[${time}] <b>${label}</b>: <pre style="margin:0; white-space:pre-wrap; display:inline;">${content}</pre>`;
    panel.prepend(entry);
    console.log(`[DEBUG] ${label}:`, data);
}

// 1. Core Logic: Define what happens when Zoho loads
function startWidget(data) {
    logDebug("PAGELOAD", data);
    
    const sessionStr = localStorage.getItem("amp_session");
    if (sessionStr) {
        logDebug("AUTH", "Session active. Loading UI...");
        showMainUI();
        
        // Auto-load View if provided by CRM button context
        if (data && data.cvid) {
            logDebug("VIEW", `Loading CVID: ${data.cvid}`);
            loadViewData(data.cvid);
        }
        
        fetchCustomViews();
    } else {
        logDebug("AUTH", "No session found. Redirecting to login.");
        showLogin();
    }
}

// 2. Initialization: Wait for the SDK to be available
function checkSDK() {
    if (typeof ZOHO !== "undefined") {
        logDebug("SYSTEM", "Zoho SDK detected. Initializing...");
        ZOHO.embeddedApp.on("PageLoad", startWidget);
        ZOHO.embeddedApp.init();
    } else {
        logDebug("SYSTEM", "Waiting for Zoho SDK...");
        setTimeout(checkSDK, 200);
    }
}

// Start the check
checkSDK();

/* --- CRM API Functions --- */

function fetchCustomViews() {
    logDebug("ZOHO_API", "Requesting getCustomViews...");
    ZOHO.CRM.API.getCustomViews({ Entity: "Leads" })
        .then(res => {
            logDebug("VIEWS_RES", res);
            const selector = document.getElementById("view-selector");
            selector.innerHTML = '<option value="">-- Select View --</option>';
            
            if (res.custom_views && res.custom_views.length > 0) {
                res.custom_views.forEach(view => {
                    let opt = document.createElement("option");
                    opt.value = view.id;
                    opt.innerHTML = view.display_value;
                    selector.appendChild(opt);
                });
            } else {
                logDebug("WARNING", "No views returned. Check permissions/scopes.");
            }
        })
        .catch(err => logDebug("VIEWS_ERROR", err));
}

function loadViewData(cvid) {
    if (!cvid) return;
    logDebug("ZOHO_API", `Fetching leads for CVID: ${cvid}`);
    
    ZOHO.CRM.API.getAllRecords({ Entity: "Leads", cvid: cvid, sort_order: "asc" })
        .then(res => {
            logDebug("RECORDS_RES", `Loaded ${res.data ? res.data.length : 0} records.`);
            leadQueue = res.data || [];
            currentIndex = 0;
            updateLeadUI();
        })
        .catch(err => logDebug("RECORDS_ERROR", err));
}

/* --- UI and Dialer Logic --- */

function updateLeadUI() {
    const nameEl = document.getElementById("entity-name");
    const phoneEl = document.getElementById("entity-phone");
    const countEl = document.getElementById("queue-count");

    if (leadQueue.length > 0 && currentIndex < leadQueue.length) {
        const lead = leadQueue[currentIndex];
        const name = lead.Full_Name || `${lead.First_Name || ''} ${lead.Last_Name || ''}`.trim() || "Unnamed";
        const phone = lead.Phone || lead.Mobile || "No Number";
        
        nameEl.innerText = name;
        phoneEl.innerText = phone;
        countEl.innerText = `Remaining: ${leadQueue.length - currentIndex}`;
    } else {
        nameEl.innerText = "Queue Finished";
        phoneEl.innerText = "--";
    }
}

async function performLogin() {
    const u = document.getElementById("login-user").value;
    const p = document.getElementById("login-pass").value;
    const status = document.getElementById("login-status");

    status.innerText = "Authenticating...";
    logDebug("LOGIN", `Attempting login for ${u}`);

    try {
        const res = await fetch('/api/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username: u, password: p })
        });
        const data = await res.json();

        if (data.access_token) {
            logDebug("LOGIN_SUCCESS", "Token received.");
            localStorage.setItem("amp_session", JSON.stringify(data));
            showMainUI();
            fetchCustomViews();
        } else {
            logDebug("LOGIN_FAILED", data);
            status.innerText = "Invalid Credentials";
        }
    } catch (e) {
        logDebug("NET_ERROR", e.message);
        status.innerText = "Gateway Unreachable";
    }
}

async function initiateCall() {
    const lead = leadQueue[currentIndex];
    const session = JSON.parse(localStorage.getItem("amp_session"));

    if (!lead || (!lead.Phone && !lead.Mobile)) {
        logDebug("DIAL_ERROR", "No lead or phone number.");
        return alert("No valid number to dial.");
    }

    const phone = lead.Phone || lead.Mobile;
    logDebug("DIALER", `Calling ${phone} via crmapi...`);

    ZOHO.CRM.CONNECTOR.invoke("crmapi", {
        "url": "https://amp-dialer.vercel.app/api/dial",
        "method": "POST",
        "body": JSON.stringify({ toNumber: phone, session: session })
    }).then(res => {
        logDebug("DIAL_RES", res);
        currentIndex++;
        updateLeadUI();
    }).catch(err => {
        logDebug("CONNECTOR_ERROR", err);
        alert("Zoho Connection 'crmapi' failed.");
    });
}

function skipLead() {
    currentIndex++;
    updateLeadUI();
}

function showMainUI() {
    document.getElementById("login-screen").style.display = "none";
    document.getElementById("main-ui").style.display = "block";
}

function showLogin() {
    document.getElementById("login-screen").style.display = "block";
    document.getElementById("main-ui").style.display = "none";
}
