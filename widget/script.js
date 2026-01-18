/* script.js - Unified SDK Version */

let leadQueue = [];
let currentIndex = 0;

// Initialize when ZOHO SDK is ready
ZOHO.embeddedApp.on("PageLoad", function(data) {
    console.log("AmpDialer Context:", data);
    
    const sessionStr = localStorage.getItem("amp_session");
    if (sessionStr) {
        showMainUI();
        // Modern SDK uses ZOHO.CRM.API
        if (data && data.cvid) {
            loadViewData(data.cvid);
        }
        fetchCustomViews();
    } else {
        showLogin();
    }
});

// Start the modern initialization handshake
ZOHO.embeddedApp.init();

/* --- UI Helpers --- */
function showMainUI() {
    document.getElementById("login-screen").style.display = "none";
    document.getElementById("main-ui").style.display = "block";
}

function showLogin() {
    document.getElementById("login-screen").style.display = "block";
    document.getElementById("main-ui").style.display = "none";
}

/* --- Data Management --- */
function fetchCustomViews() {
    // Requires Unified SDK for .CRM namespace
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
        }).catch(e => console.error("View Fetch Error:", e));
}

function loadViewData(cvid) {
    document.getElementById("queue-count").innerText = "Loading Queue...";
    ZOHO.CRM.API.getAllRecords({ Entity: "Leads", cvid: cvid })
        .then(res => {
            leadQueue = res.data || [];
            currentIndex = 0;
            updateLeadUI();
        });
}

function updateLeadUI() {
    const nameEl = document.getElementById("entity-name");
    const phoneEl = document.getElementById("entity-phone");
    const countEl = document.getElementById("queue-count");

    if (leadQueue.length > 0 && currentIndex < leadQueue.length) {
        const lead = leadQueue[currentIndex];
        // Note: Field names are case-sensitive in Zoho
        nameEl.innerText = lead.Full_Name || "Unnamed Lead";
        phoneEl.innerText = lead.Phone || lead.Mobile || "No Number";
        countEl.innerText = `Leads in Queue: ${leadQueue.length - currentIndex}`;
    } else {
        nameEl.innerText = "Queue Finished";
        phoneEl.innerText = "--";
    }
}

/* --- Dialing via 'crmapi' Connection --- */
async function initiateCall() {
    if (!leadQueue[currentIndex]) return alert("No lead active.");

    const lead = leadQueue[currentIndex];
    const phone = lead.Phone || lead.Mobile;
    const session = JSON.parse(localStorage.getItem("amp_session"));

    if (!phone) return alert("Lead missing phone number.");

    // This function ONLY works with the js.zohostatic.com SDK link
    ZOHO.CRM.CONNECTOR.invoke("crmapi", {
        "url": "https://amp-dialer.vercel.app/api/dial",
        "method": "POST",
        "body": JSON.stringify({
            toNumber: phone,
            session: session
        })
    }).then(res => {
        console.log("Dial Success:", res);
        currentIndex++;
        updateLeadUI();
    }).catch(err => {
        console.error("Connector Error:", err);
        alert("Connection failed. Check 'crmapi' configuration.");
    });
}
