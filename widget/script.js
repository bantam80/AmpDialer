let leadQueue = [];
let currentIndex = 0;

ZOHO.embeddedApp.on("PageLoad", function(data) {
    // 1. Fetch available Custom Views for the Leads Module
    ZOHO.CRM.API.getCustomViews({ Entity: "Leads" })
        .then(res => {
            const selector = document.getElementById("view-selector");
            res.custom_views.forEach(view => {
                let opt = document.createElement("option");
                opt.value = view.id;
                opt.innerHTML = view.display_value;
                selector.appendChild(opt);
            });
        });
});

ZOHO.embeddedApp.init();

async function loadViewData() {
    const cvid = document.getElementById("view-selector").value;
    if (!cvid) return;

    // 2. Load records associated with the selected Custom View
    ZOHO.CRM.API.getAllRecords({ Entity: "Leads", cvid: cvid, sort_order: "asc" })
        .then(res => {
            leadQueue = res.data;
            currentIndex = 0;
            updateQueueUI();
        });
}

function updateQueueUI() {
    if (leadQueue.length > 0 && currentIndex < leadQueue.length) {
        const lead = leadQueue[currentIndex];
        document.getElementById("active-lead-card").style.display = "block";
        document.getElementById("entity-name").innerText = lead.Full_Name || "Unnamed Lead";
        document.getElementById("entity-phone").innerText = lead.Phone || lead.Mobile || "No Number";
        document.getElementById("queue-stats").innerText = `Leads in Queue: ${leadQueue.length - currentIndex}`;
    } else {
        document.getElementById("active-lead-card").style.display = "none";
        document.getElementById("queue-stats").innerText = "Queue Completed";
    }
}

async function initiateCall() {
    const session = JSON.parse(localStorage.getItem("amp_session"));
    const phone = document.getElementById("entity-phone").innerText;

    if (phone === "No Number") return skipLead();

    const res = await fetch('/api/dial', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ toNumber: phone, session })
    });
    
    const data = await res.json();
    if (res.ok) {
        console.log("Dialing:", phone);
        // Advance to next lead after successful trigger
        currentIndex++;
        updateQueueUI();
    }
}
