/**
 * AmpDialer Logic Controller
 * Architecture: Flat Root (No /api folder)
 */

let leadQueue = [];
let currentIndex = 0;

/**
 * 1. SDK HANDSHAKE & INITIALIZATION
 * Ensures ZOHO object is defined before running logic
 */
function initWidget() {
    if (typeof ZOHO !== "undefined") {
        ZOHO.embeddedApp.on("PageLoad", function(data) {
            const session = localStorage.getItem("amp_session");
            if (session) {
                showMainUI();
                fetchCustomViews();
                // If specific view ID passed via Zoho, load it
                if (data && data.cvid) loadViewData(data.cvid);
            } else {
                showLogin();
            }
        });
        ZOHO.embeddedApp.init();
    } else {
        // Retry loop to handle SDK race condition
        setTimeout(initWidget, 100);
    }
}

// Start the handshake
initWidget();

/**
 * 2. AUTHENTICATION (ROOT-LEVEL)
 * Points directly to /login.js in root
 */
async function performLogin() {
    const user = document.getElementById("login-user").value;
    const pass = document.getElementById("login-pass").value;
    const status = document.getElementById("login-status");

    status.innerText = "Authenticating...";

    try {
        const res = await fetch('/login.js', { 
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
            status.innerText = "Login Failed: " + (data.error || "Check credentials");
        }
    } catch (e) {
        status.innerText = "Network Error - check Vercel Logs";
    }
}

/**
 * 3. ZOHO DATA INTEGRATION
 * Pulls Views and Records using Zoho SDK
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
 * 4. TELEPHONY EXECUTION
 * Points to /dial.js using verified 'crmapi' connection
 */
async function initiateCall() {
    if (!leadQueue[currentIndex]) return;
    
    const lead = leadQueue[currentIndex];
    const session = JSON.parse(localStorage.getItem("amp_session"));
    
    // Invoke Vercel root function through Zoho's secure bridge
    ZOHO.CRM.CONNECTOR.invoke("crmapi", {
        "url": "https://amp-dialer.vercel.app/dial.js", 
        "method": "POST",
        "body": JSON.stringify({ 
            toNumber: lead.Phone || lead.Mobile, 
            session: session 
        })
    }).then(response => {
        console.log("Dialer Response:", response);
        currentIndex++;
        updateLeadUI();
    });
}

/**
 * 5. UI CONTROLS
 */
function updateLeadUI() {
    const nameEl = document.getElementById("entity-name");
    const phoneEl = document.getElementById("entity-phone");
    const countEl = document.getElementById("queue-count");

    if (leadQueue.length > 0 && currentIndex < leadQueue.length) {
        const lead = leadQueue[currentIndex];
        nameEl.innerText = lead.Full_Name || "Unnamed Lead";
        phoneEl.innerText = lead.Phone || lead.Mobile || "No Number";
        countEl.innerText = `Remaining: ${leadQueue.length - currentIndex}`;
    } else {
        nameEl.innerText = "Queue Empty";
        phoneEl.innerText = "--";
        countEl.innerText = "Leads: 0";
    }
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
