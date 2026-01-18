let currentRecord = {};
let activeCallId = null;

// Initialize Zoho Widget
ZOHO.embeddedApp.on("PageLoad", function(data) {
    // data contains entity information like Entity and EntityId
    ZOHO.CRM.API.getRecord({
        Entity: data.Entity,
        RecordID: data.EntityId
    }).then(function(response) {
        currentRecord = response.data[0];
        document.getElementById("entity-name").innerText = currentRecord.Full_Name || currentRecord.Company || "Unknown";
        document.getElementById("entity-phone").innerText = currentRecord.Phone || currentRecord.Mobile || "No Number";
    });
});

ZOHO.embeddedApp.init();

async function initiateCall() {
    const phone = document.getElementById("entity-phone").innerText;
    if(phone === "--") return alert("No phone number found");

    // Change UI State
    document.getElementById("dial-btn").disabled = true;

    const response = await fetch('/api/dial', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            toNumber: phone,
            agentExt: '101', // This should eventually be dynamic
            agentDomain: 'your-pbx-domain.com'
        })
    });

    const result = await response.json();
    if(result.success) {
        activeCallId = result.data.call_id;
        document.getElementById("vmdrop-btn").disabled = false;
        document.getElementById("hangup-btn").disabled = false;
    }
}

async function triggerVMDrop() {
    if(!activeCallId) return;
    
    await fetch('/api/vmdrop', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            callId: activeCallId,
            agentExt: '101',
            agentDomain: 'your-pbx-domain.com'
        })
    });
    alert("Voicemail drop initiated");
}

async function saveToZoho() {
    const notes = document.getElementById("call-notes").value;
    const disp = document.getElementById("disposition").value;

    // Log the call in Zoho CRM
    ZOHO.CRM.API.addNotes({
        Entity: "Leads", // Should be dynamic based on PageLoad data
        RecordID: currentRecord.id,
        Title: "AmpDialer Call Summary",
        Content: `Disposition: ${disp}\nNotes: ${notes}`
    }).then(function(data){
        alert("Log saved successfully!");
    });
}
