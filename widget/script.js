let leadQueue = [];
let currentIndex = 0;

ZOHO.embeddedApp.on("PageLoad", function(data) {
    // When the button is pressed, Zoho passes the Custom View ID (cvid)
    if (data && data.cvid) {
        loadViewData(data.cvid);
    }
    fetchCustomViews();
});

ZOHO.embeddedApp.init();

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

async function loadViewData(cvid) {
    // Fetch up to 200 records from the selected Custom View
    ZOHO.CRM.API.getAllRecords({ Entity: "Leads", cvid: cvid })
        .then(res => {
            leadQueue = res.data || [];
            currentIndex = 0;
            updateUI(); // Refresh the card with the first lead
        });
}

async function initiateCall() {
    const lead = leadQueue[currentIndex];
    const phone = lead.Phone || lead.Mobile;
    const session = JSON.parse(localStorage.getItem("amp_session"));

    if (!phone) return alert("No phone number found.");

    // Using your 'crmapi' connection to bridge to your Vercel dialer
    ZOHO.CRM.CONNECTOR.invoke("crmapi", {
        "url": "https://amp-dialer.vercel.app/api/dial",
        "method": "POST",
        "body": JSON.stringify({
            "toNumber": phone,
            "session": session
        })
    }).then(res => {
        console.log("Dialer Response:", res);
        // Logic to move to next lead or show 'active' state
    });
}
