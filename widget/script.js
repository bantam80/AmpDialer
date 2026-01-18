/* script.js - Stable Initialization */

let leadQueue = [];
let currentIndex = 0;

// Listen for PageLoad - Zoho calls this when the widget is framed properly
ZOHO.embeddedApp.on("PageLoad", function(data) {
    console.log("Zoho SDK Verified. Context:", data);
    
    const sessionStr = localStorage.getItem("amp_session");
    if (sessionStr) {
        showMainUI();
        if (data && data.cvid) loadViewData(data.cvid);
        fetchCustomViews();
    } else {
        showLogin();
    }
});

// Explicitly call init - if this fails, check browser console for 'ZOHO undefined'
try {
    ZOHO.embeddedApp.init();
} catch (e) {
    console.error("Critical: ZOHO SDK failed to initialize. Link may be blocked.", e);
}

/* --- UI Logic --- */

function showMainUI() {
    document.getElementById("login-screen").style.display = "none";
    document.getElementById("main-ui").style.display = "block";
}

function showLogin() {
    document.getElementById("login-screen").style.display = "block";
    document.getElementById("main-ui").style.display = "none";
}

async function performLogin() {
    const username = document.getElementById("login-user").value;
    const password = document.getElementById("login-pass").value;
    const statusDiv = document.getElementById("login-status");

    statusDiv.innerText = "Authenticating...";

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
            statusDiv.innerText = "Login Failed: " + (data.error || "Invalid Credentials");
        }
    } catch (e) {
        statusDiv.innerText = "Network Error - check Vercel Logs";
    }
}

/* --- Zoho Data Functions --- */

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
        document.getElementById("entity-name").innerText = lead.Full_Name || (lead.First_Name + ' ' + lead.Last_Name).trim() || "Unnamed Lead";
        document.getElementById("entity-phone").innerText = lead.Phone || lead.Mobile || "No Number";
        document.getElementById("queue-count").innerText = `Queue: ${leadQueue.length - currentIndex}`;
    }
}

function skipLead() {
    currentIndex++;
    updateLeadUI();
}

async function initiateCall() {
    const lead = leadQueue[currentIndex];
    const session = JSON.parse(localStorage.getItem("amp_session"));
    if (!lead || !lead.Phone) return alert("No number to dial.");

    ZOHO.CRM.CONNECTOR.invoke("crmapi", {
        "url": "https://amp-dialer.vercel.app/api/dial",
        "method": "POST",
        "body": JSON.stringify({ toNumber: lead.Phone, session: session })
    }).then(res => {
        currentIndex++;
        updateLeadUI();
    });
}
