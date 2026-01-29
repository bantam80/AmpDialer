import React, { useMemo, useState } from "react";

function getCrmApi() {
  const api = window?.ZOHO?.CRM?.API;
  [cite_start]if (!api) throw new Error("ZOHO.CRM.API not available"); [cite: 197]
  return api;
}

// v1.1.1 Fix: Strip milliseconds for Zoho API compatibility
function toZohoDateTime(isoString) {
  [cite_start]return isoString.split(".")[0] + "Z"; [cite: 331]
}

async function insertRecordCompat({ Entity, APIData }) {
  const api = getCrmApi();
  [cite_start]if (typeof api.insertRecord === "function") return api.insertRecord({ Entity, APIData }); [cite: 102]
  [cite_start]if (typeof api.createRecord === "function") return api.createRecord({ Entity, APIData }); [cite: 103]
  throw new Error("No supported record-create method found.");
}

async function updateRecordCompat({ Entity, APIData }) {
  const api = getCrmApi();
  [cite_start]if (typeof api.updateRecord === "function") return api.updateRecord({ Entity, APIData }); [cite: 201]
  throw new Error("updateRecord not available");
}

async function addNoteCompat({ RecordID, Title, Content }) {
  const api = getCrmApi();
  [cite_start]if (typeof api.addNotes === "function") return api.addNotes({ Entity: "Leads", RecordID, Title, Content }); [cite: 203]
  [cite_start]return insertRecordCompat({ Entity: "Notes", APIData: { Parent_Id: RecordID, Note_Title: Title, Note_Content: Content } }); [cite: 204]
}

function pad2(n) {
  return String(n).padStart(2, "0");
}

function msToHHmm(ms) {
  const totalMinutes = Math.max(0, Math.round(ms / 60000));
  const hours = Math.floor(totalMinutes / 60);
  const mins = totalMinutes % 60;
  [cite_start]return `${pad2(hours)}:${pad2(mins)}`; [cite: 207]
}

async function createCallForLead({ leadId, subject, startedAtIso, durationHHmm, resultText }) {
  const payloads = [
    [cite_start]{ Subject: subject, Call_Type: "Outbound", "$se_module": "Leads", What_Id: leadId, Call_Start_Time: toZohoDateTime(startedAtIso), Call_Duration: durationHHmm, Outbound_Call_Status: "Completed", Call_Result: resultText }, [cite: 332]
    [cite_start]{ Subject: subject, Call_Type: "Outbound", "$se_module": "Leads", What_Id: leadId, Call_Start_Time: toZohoDateTime(startedAtIso), Call_Duration: durationHHmm, Outgoing_Call_Status: "Completed", Call_Result: resultText }, [cite: 332]
    [cite_start]{ Subject: subject, Call_Type: "Outbound", "$se_module": "Leads", What_Id: leadId, Call_Start_Time: toZohoDateTime(startedAtIso), Call_Duration: durationHHmm, Call_Status: "Completed" }, [cite: 332]
    [cite_start]{ Subject: subject, Call_Type: "Outbound", "$se_module": "Leads", What_Id: leadId, Call_Start_Time: toZohoDateTime(startedAtIso), Call_Duration: durationHHmm } [cite: 332]
  ];

  let lastErr = null;
  for (let i = 0; i < payloads.length; i++) {
    try {
      [cite_start]return await insertRecordCompat({ Entity: "Calls", APIData: payloads[i] }); [cite: 210]
    } catch (e) {
      lastErr = e;
      console.warn(`Call insert attempt ${i + 1} failed:`, e);
    }
  }
  throw lastErr;
}

function isCallStillActive(upstreamBody, callid) {
  [cite_start]if (!callid || !Array.isArray(upstreamBody)) return false; [cite: 213]
  [cite_start]return upstreamBody.some((c) => c && (c.orig_callid === callid || c.by_callid === callid || c.term_callid === callid)); [cite: 214]
}

async function ringlogixDisconnectAndWait({ session, activeCall }) {
  const token = session?.access_token;
  const uid = activeCall?.uid || session?.uid;
  const callid = activeCall?.callid;

  [cite_start]if (!token || !uid || !callid) throw new Error("Missing disconnect inputs."); [cite: 216]

  await fetch("/api/hangup", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ uid, callid })
  [cite_start]}); [cite: 217]

  const started = Date.now();
  [cite_start]while (Date.now() - started < 15000) { [cite: 223]
    try {
      // CACHE BUSTER for User 102: Append _t timestamp to the URL
      const r = await fetch(`/api/activeCalls?uid=${encodeURIComponent(uid)}&_t=${Date.now()}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      const j = await r.json();
      [cite_start]if (!isCallStillActive(j?.upstreamBody, callid)) return { ok: true }; [cite: 228]
    } catch (e) {
      console.warn("Poll failed", e);
    }
    [cite_start]await new Promise((res) => setTimeout(res, 750)); [cite: 231]
  }
  [cite_start]return { ok: true, via: "timeout" }; [cite: 232]
}

export default function InCall({ lead, session, activeCall, onEndCall }) {
  const [note, setNote] = useState("");
  [cite_start]const [subject, setSubject] = useState("Call with " + (lead?.Name || "Lead")); [cite: 235]
  [cite_start]const [status, setStatus] = useState(lead?.Status || ""); [cite: 235]
  const [isSaving, setIsSaving] = useState(false);

  const statusOptions = [
    "Attempted to Contact", "Contact in Future", "Junk Lead", "Lost Lead",
    "Not Contacted", "Qualified", "Not Qualified", "Completed | Contacted"
  [cite_start]]; [cite: 237]

  async function handleSaveAndEnd() {
    setIsSaving(true);
    try {
      [cite_start]await ringlogixDisconnectAndWait({ session, activeCall }); [cite: 245]
      const ops = [];
      if (subject?.trim()) {
        [cite_start]const startedAtIso = activeCall?.startedAt || new Date().toISOString(); [cite: 249]
        [cite_start]const durationHHmm = msToHHmm(Date.now() - new Date(startedAtIso).getTime()); [cite: 250]
        [cite_start]ops.push(createCallForLead({ leadId: lead.id, subject: subject.trim(), startedAtIso, durationHHmm, resultText: status || "Completed" })); [cite: 251]
      }
      [cite_start]if (note?.trim()) ops.push(addNoteCompat({ RecordID: lead.id, Title: "Dialer Note", Content: note.trim() })); [cite: 251]
      [cite_start]if (status && status !== lead.Status) ops.push(updateRecordCompat({ Entity: "Leads", APIData: { id: lead.id, Lead_Status: status } })); [cite: 252]
      
      [cite_start]await Promise.allSettled(ops); [cite: 253]
      [cite_start]onEndCall(); [cite: 255]
    } catch (e) {
      [cite_start]alert(`Save failed: ${e?.message || JSON.stringify(e)}`); [cite: 334]
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div className="max-w-lg mx-auto mt-4 bg-white rounded-lg shadow-xl border-t-4 border-blue-500">
      <div className="p-4 bg-blue-50 border-b flex justify-between items-center">
        <div>
          <h2 className="text-lg font-bold text-gray-800">In Call: {lead?.Name}</h2>
          <p className="text-sm text-blue-600 font-mono">{lead?.Phone}</p>
        </div>
        {/* v1.1.1 Fix: Standard HTML anchor for stability in Zoho Sandbox */}
        <a 
          href={`https://crm.zoho.com/crm/tab/Leads/${lead?.id}`} 
          target="_blank" 
          rel="noopener noreferrer"
          [cite_start]onClick={(e) => e.stopPropagation()} [cite: 329]
          className="bg-white border px-3 py-1 rounded text-xs font-bold text-gray-700 hover:bg-gray-100 shadow-sm"
        >
          Open Lead
        </a>
      </div>
      <div className="p-6 space-y-4">
        <div>
          <label className="block text-xs font-bold text-gray-500 uppercase">Call Subject</label>
          <input type="text" className="w-full p-2 mt-1 border rounded" value={subject} onChange={(e) => setSubject(e.target.value)} />
        </div>
        <div>
          <label className="block text-xs font-bold text-gray-500 uppercase">Add Note</label>
          <textarea 
            className="w-full p-2 mt-1 border rounded h-24" 
            value={note} 
            onChange={(e) => setNote(e.target.value)} 
            placeholder="Type notes here..." 
          />
        </div>
        <div>
          <label className="block text-xs font-bold text-gray-500 uppercase">Update Disposition</label>
          <select className="w-full p-2 mt-1 border rounded bg-white" value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="">-- Select Status --</option>
            {statusOptions.map((opt) => (<option key={opt} value={opt}>{opt}</option>))}
          </select>
        </div>
        <button 
          onClick={handleSaveAndEnd} 
          disabled={isSaving} 
          className="w-full py-3 mt-4 text-white bg-red-600 rounded hover:bg-red-700 font-bold shadow disabled:opacity-50"
        >
          {isSaving ? "Processing..." : "End Interaction & Next"}
        </button>
      </div>
    </div>
  );
}
