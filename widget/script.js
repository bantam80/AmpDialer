/* script.js - Debug Version */

let leadQueue = [];
let currentIndex = 0;

function logDebug(label, data) {
    const panel = document.getElementById('debug-panel');
    const entry = document.createElement('div');
    entry.className = 'debug-entry';
    const timestamp = new Date().toLocaleTimeString();
    
    let content = typeof data === 'object' ? JSON.stringify(data) : data;
    entry.innerHTML = `<span class="debug-label">[${timestamp}] ${label}:</span> ${content}`;
    panel.prepend(entry);
    console.log(`[DEBUG] ${label}:`, data);
}

ZOHO.embeddedApp.on("PageLoad", function(data) {
    logDebug("PageLoad Data Received", data);
    
    const sessionStr = localStorage.getItem("amp_session");
    if (sessionStr) {
        logDebug("Session Found", "Resuming...");
        showMainUI();
        if (data && data.cvid) {
            logDebug("Auto-loading CVID", data.cvid);
            loadViewData(data.cvid);
        }
        fetchCustomViews();
    } else {
        logDebug("No Session", "Showing Login Screen");
        showLogin();
    }
});

try {
    logDebug("System", "Initializing ZOHO SDK...");
    ZOHO.embeddedApp.init();
} catch (e) {
    logDebug("SDK Error", e.message);
}

/* --- Data Management with Error Logging --- */

function fetchCustomViews() {
    logDebug("Views", "Requesting getCustomViews for Leads...");
    ZOHO.CRM.API.getCustomViews({ Entity: "Leads" })
        .then(res => {
            logDebug("Views Response", res);
            const selector = document.getElementById("view-selector");
            selector.innerHTML = '<option value="">-- Switch View --</option>';
            
            if (res.custom_views && res.custom_views.length > 0) {
                res.custom_views.forEach(view => {
                    let opt = document.createElement("option");
                    opt.value = view.id;
                    opt.innerHTML = view.display_value;
                    selector.appendChild(opt);
                });
                logDebug("Views", `Loaded ${res.custom_views.length} views.`);
            } else {
                logDebug("Views Warning", "API returned 0 views.");
            }
        }).catch(err => {
            logDebug("Views API Critical Error", err);
        });
}

function loadViewData(cvid) {
    logDebug("Queue", `Fetching records for CVID: ${cvid}`);
    ZOHO.CRM.API.getAllRecords({ Entity: "Leads", cvid: cvid })
        .then(res => {
            logDebug("Records Response", res);
            leadQueue = res.data || [];
            currentIndex = 0;
            updateLeadUI();
        }).catch(err => {
            logDebug("Records API Error", err);
        });
}

// ... keep existing showLogin, showMainUI, performLogin, updateLeadUI, skipLead, and initiateCall ...
