let currentRecord = {};
let activeCallId = null;

ZOHO.embeddedApp.on("PageLoad", function(data) {
    ZOHO.CRM.API.getRecord({ Entity: data.Entity, RecordID: data.EntityId })
        .then(res => {
            currentRecord = res.data[0];
            document.getElementById("entity-name").innerText = currentRecord.Full_Name || "No Name";
            document.getElementById("entity-phone").innerText = currentRecord.Phone || currentRecord.Mobile || "--";
        });
});

ZOHO.embeddedApp.init();

async function performLogin() {
    const user = document.getElementById("login-user").value;
    const pass = document.getElementById("login-pass").value;
    const res = await fetch('/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user, pass })
    });
    const data = await res.json();
    if (data.success) {
        localStorage.setItem("amp_session", JSON.stringify(data.session));
        document.getElementById("login-screen").style.display = "none";
        document.getElementById("main-ui").style.display = "block";
    } else { alert("Login failed"); }
}

async function initiateCall() {
    const session = JSON.parse(localStorage.getItem("amp_session"));
    const phone = document.getElementById("entity-phone").innerText;
    const res = await fetch('/api/dial', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ toNumber: phone, session })
    });
    const data = await res.json();
    if (data.success) {
        activeCallId = data.data.call_id;
        document.getElementById("vmdrop-btn").disabled = false;
    }
}

async function triggerVMDrop() {
    const session = JSON.parse(localStorage.getItem("amp_session"));
    await fetch('/api/vmdrop', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ callId: activeCallId, session })
    });
    alert("VM Dropped");
}
