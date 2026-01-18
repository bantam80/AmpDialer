/* script.js - Final Stable Version */

let leadQueue = [];
let currentIndex = 0;

// Wrap in a function to prevent immediate execution if SDK is slow
function initWidget() {
    if (typeof ZOHO === "undefined") {
        console.warn("Zoho SDK not ready, retrying...");
        setTimeout(initWidget, 100);
        return;
    }

    ZOHO.embeddedApp.on("PageLoad", function(data) {
        console.log("AmpDialer Context:", data);
        
        const sessionStr = localStorage.getItem("amp_session");
        if (sessionStr) {
            showMainUI();
            if (data && data.cvid) loadViewData(data.cvid);
            fetchCustomViews();
        } else {
            showLogin();
        }
    });

    ZOHO.embeddedApp.init();
}

// Start the check
initWidget();

/* --- Core Functions --- */

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

    statusDiv.innerText = "Connecting...";

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
            statusDiv.innerText = "Error: " + (data.error || "Login Failed");
        }
    } catch (e) { statusDiv.innerText = "Network Error"; }
}

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
        document.getElementById("entity-name").innerText = lead.Full_Name || (lead.First_Name + ' ' + lead.Last_Name).trim() || "Unnamed Lead";
        document.getElementById("entity-phone").innerText = lead.Phone || lead.Mobile || "No Number";
        document.getElementById("queue-count").innerText = `Leads: ${leadQueue.length - currentIndex}`;
    }
}

function skipLead() {
    currentIndex++;
    updateLeadUI();
}

async function initiateCall() {
    const lead = leadQueue[currentIndex];
    const session = JSON.parse(localStorage.getItem("amp_session"));

    if (!lead || !lead.Phone) return alert("No valid lead/phone selected.");

    ZOHO.CRM.CONNECTOR.invoke("crmapi", {
        "url": "https://amp-dialer.vercel.app/api/dial",
        "method": "POST",
        "body": JSON.stringify({ toNumber: lead.Phone, session: session })
    }).then(res => {
        console.log("Dial Triggered:", res);
        currentIndex++;
        updateLeadUI();
    });
}
