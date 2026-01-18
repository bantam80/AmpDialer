/* script.js - Final Deployment */

let leadQueue = [];
let currentIndex = 0;

function logDebug(label, data) {
    const panel = document.getElementById('debug-panel');
    if (!panel) return;
    const entry = document.createElement('div');
    let content = typeof data === 'object' ? JSON.stringify(data) : data;
    entry.innerHTML = `[${new Date().toLocaleTimeString()}] <b>${label}</b>: ${content}`;
    panel.prepend(entry);
}

// standard Zoho Initialization
ZOHO.embeddedApp.on("PageLoad", function(data) {
    logDebug("PAGELOAD", data);
    const session = localStorage.getItem("amp_session");
    if (session) {
        showMainUI();
        if (data && data.cvid) loadViewData(data.cvid);
        fetchCustomViews();
    } else {
        showLogin();
    }
});

ZOHO.embeddedApp.init();

/* --- API Functions --- */

function fetchCustomViews() {
    logDebug("API", "Fetching views...");
    ZOHO.CRM.API.getCustomViews({ Entity: "Leads" })
        .then(res => {
            logDebug("VIEWS_DATA", res);
            const sel = document.getElementById("view-selector");
            sel.innerHTML = '<option value="">-- Select View --</option>';
            if (res.custom_views) {
                res.custom_views.forEach(v => {
                    let o = document.createElement("option");
                    o.value = v.id; o.innerText = v.display_value;
                    sel.appendChild(o);
                });
            }
        });
}

function loadViewData(cvid) {
    if (!cvid) return;
    ZOHO.CRM.API.getAllRecords({ Entity: "Leads", cvid: cvid })
        .then(res => {
            logDebug("RECORDS", `Loaded ${res.data ? res.data.length : 0}`);
            leadQueue = res.data || [];
            currentIndex = 0;
            updateLeadUI();
        });
}

function updateLeadUI() {
    if (leadQueue.length > 0 && currentIndex < leadQueue.length) {
        const lead = leadQueue[currentIndex];
        document.getElementById("entity-name").innerText = lead.Full_Name || "Unnamed";
        document.getElementById("entity-phone").innerText = lead.Phone || lead.Mobile || "--";
    }
}

async function performLogin() {
    const u = document.getElementById("login-user").value;
    const p = document.getElementById("login-pass").value;
    try {
        const res = await fetch('/api/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username: u, password: p })
        });
        const data = await res.json();
        if (data.access_token) {
            localStorage.setItem("amp_session", JSON.stringify(data));
            showMainUI();
            fetchCustomViews();
        }
    } catch (e) { logDebug("LOGIN_ERR", e.message); }
}

async function initiateCall() {
    const lead = leadQueue[currentIndex];
    const session = JSON.parse(localStorage.getItem("amp_session"));
    ZOHO.CRM.CONNECTOR.invoke("crmapi", {
        "url": "https://amp-dialer.vercel.app/api/dial",
        "method": "POST",
        "body": JSON.stringify({ toNumber: lead.Phone, session: session })
    }).then(() => {
        currentIndex++;
        updateLeadUI();
    });
}

function skipLead() { currentIndex++; updateLeadUI(); }
function showMainUI() { document.getElementById("login-screen").style.display = "none"; document.getElementById("main-ui").style.display = "block"; }
function showLogin() { document.getElementById("login-screen").style.display = "block"; document.getElementById("main-ui").style.display = "none"; }
