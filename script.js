let leadQueue = [];
let currentIndex = 0;

/**
 * Initialization: Wait for SDK Handshake
 */
function initWidget() {
    if (typeof ZOHO !== "undefined") {
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
    } else {
        setTimeout(initWidget, 100); 
    }
}
initWidget();

/**
 * Data Actions
 */
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
    ZOHO.CRM.API.getAllRecords({ Entity: "Leads", cvid: cvid })
        .then(res => {
            leadQueue = res.data || [];
            currentIndex = 0;
            updateLeadUI();
        });
}

/**
 * API Calls: Authenticate and Dial
 */
async function performLogin() {
    const user = document.getElementById("login-user").value;
    const pass = document.getElementById("login-pass").value;
    const status = document.getElementById("login-status");
    status.innerText = "Authenticating...";

    try {
        const res = await fetch('/login', { // Corrected root path
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
            status.innerText = "Login Failed: Check credentials";
        }
    } catch (e) { status.innerText = "API Connection Error"; }
}

async function initiateCall() {
    const lead = leadQueue[currentIndex];
    const session = JSON.parse(localStorage.getItem("amp_session"));
    
    // CORRECTION: Pointing to root dial endpoint via Zoho Connector
    ZOHO.CRM.CONNECTOR.invoke("crmapi", {
        "url": "https://amp-dialer.vercel.app/dial", 
        "method": "POST",
        "body": JSON.stringify({ 
            toNumber: lead.Phone || lead.Mobile, 
            session: session 
        })
    }).then(() => {
        currentIndex++;
        updateLeadUI();
    });
}

/**
 * UI Utilities
 */
function updateLeadUI() {
    const nameEl = document.getElementById("entity-name");
    const phoneEl = document.getElementById("phone-display"); // Matched to HTML
    if (leadQueue.length > 0 && currentIndex < leadQueue.length) {
        const lead = leadQueue[currentIndex];
        nameEl.innerText = lead.Full_Name || "Unnamed Lead";
        phoneEl.innerText = lead.Phone || lead.Mobile || "No Number";
    }
}
function skipLead() { currentIndex++; updateLeadUI(); }
function showMainUI() { document.getElementById("login-screen").style.display = "none"; document.getElementById("main-ui").style.display = "block"; }
function showLogin() { document.getElementById("login-screen").style.display = "block"; document.getElementById("main-ui").style.display = "none"; }
