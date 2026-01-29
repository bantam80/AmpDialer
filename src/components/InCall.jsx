import React, { useMemo, useState } from "react";

function getCrmApi() {
  const api = window?.ZOHO?.CRM?.API;
  if (!api) throw new Error("ZOHO.CRM.API not available");
  return api;
}

function toZohoDateTime(isoString) {
  return isoString.split(".")[0] + "Z";
}

async function insertRecordCompat({ Entity, APIData }) {
  const api = getCrmApi();
  if (typeof api.insertRecord === "function") return api.insertRecord({ Entity, APIData });
  if (typeof api.createRecord === "function") return api.createRecord({ Entity, APIData });
  throw new Error("No supported record-create method found.");
}

async function updateRecordCompat({ Entity, APIData }) {
  const api = getCrmApi();
  if (typeof api.updateRecord === "function") return api.updateRecord({ Entity, APIData });
  throw new Error("updateRecord not available");
}

async function addNoteCompat({ RecordID, Title, Content }) {
  const api = getCrmApi();
  if (typeof api.addNotes === "function") return api.addNotes({ Entity: "Leads", RecordID, Title, Content });
  return insertRecordCompat({ Entity: "Notes", APIData: { Parent_Id: RecordID, Note_Title: Title, Note_Content: Content } });
}

function pad2(n) {
  return String(n).padStart(2, "0");
}

function msToHHmm(ms) {
  const totalMinutes = Math.max(0, Math.round(ms / 60000));
  const hours = Math.floor(totalMinutes / 60);
  const mins = totalMinutes % 60;
  return `${pad2(hours)}:${pad2(mins)}`;
}

async function createCallForLead({ leadId, subject, startedAtIso, durationHHmm, resultText }) {
  const payloads = [
    { Subject: subject, Call_Type: "Outbound", "$se_module": "Leads", What_Id: leadId, Call_Start_Time: toZohoDateTime(startedAtIso), Call_Duration: durationHHmm, Outbound_Call_Status: "Completed", Call_Result: resultText },
    { Subject: subject, Call_Type: "Outbound", "$se_module": "Leads", What_Id: leadId, Call_Start_Time: toZohoDateTime(startedAtIso), Call_Duration: durationHHmm, Outgoing_Call_Status: "Completed", Call_Result: resultText },
    { Subject: subject, Call_Type: "Outbound", "$se_module": "Leads", What_Id: leadId, Call_Start_Time: toZohoDateTime(startedAtIso), Call_Duration: durationHHmm, Call_Status: "Completed" },
    { Subject: subject, Call_Type: "Outbound", "$se_module": "Leads", What_Id: leadId, Call_Start_Time: toZohoDateTime(startedAtIso), Call_Duration: durationHHmm }
  ];

  let lastErr = null;
  for (let i = 0; i < payloads.length; i++) {
    try {
      return await insertRecordCompat({ Entity: "Calls", APIData: payloads[i] });
    } catch (e) {
      lastErr = e;
      console.warn(`Call insert attempt ${i + 1} failed:`, e);
    }
  }
  throw lastErr;
}

function isCallStillActive(upstreamBody, callid) {
  if (!callid || !Array.isArray(upstreamBody)) return false;
  return upstreamBody.some((c) => c && (c.orig_callid === callid || c.by_callid === callid || c.term_callid === callid));
}

async function ringlogixDisconnectAndWait({ session, activeCall }) {
  const token = session?.access_token;
  const uid = activeCall?.uid || session?.uid;
  const callid = activeCall?.callid;

  if (!token || !uid || !callid) throw new Error("Missing disconnect inputs.");

  await fetch("/api/hangup", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ uid, callid })
  });

  const started = Date.now();
  while (Date.now() - started < 15000) {
    try {
      const r = await fetch(`/api/activeCalls?uid=${encodeURIComponent(uid)}&_t=${Date.now()}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      const j = await r.json();
      if (!isCallStillActive(j?.upstreamBody, callid)) return { ok: true };
    } catch (e) {
      console.warn("Poll failed", e);
    }
    await new Promise((res) => setTimeout(res, 750));
  }
  return { ok: true, via: "timeout" };
}

export default function InCall({ lead, session, activeCall, onEndCall }) {
  const [note, setNote] = useState("");
  const [subject, setSubject] = useState("Call with " + (lead?.Name || "Lead"));
  const [status, setStatus] = useState(lead?.Status || "");
  const [isSaving, setIsSaving] = useState(false);

  const statusOptions = [
    "Attempted to Contact", "Contact in Future", "Junk Lead", "Lost Lead",
    "Not Contacted", "Qualified", "Not Qualified", "Completed | Contacted"
  ];

  async function handleSaveAndEnd() {
    setIsSaving(true);
    try {
      await ringlogixDisconnectAndWait({ session, activeCall });
      const ops = [];
      if (subject?.trim()) {
        const startedAtIso = activeCall?.startedAt || new Date().toISOString();
        const durationHHmm = msToHHmm(Date.now() - new Date(startedAtIso).getTime());
        ops.push(createCallForLead({ leadId: lead.id, subject: subject.trim(), startedAtIso, durationHHmm, resultText: status || "Completed" }));
      }
      if (note?.trim()) ops.push(addNoteCompat({ RecordID: lead.id, Title: "Dialer Note", Content: note.trim() }));
      if (status && status !== lead.Status) ops.push(updateRecordCompat({ Entity: "Leads", APIData: { id: lead.id, Lead_Status: status } }));
      
      await Promise.allSettled(ops);
      onEndCall();
    } catch (e) {
      alert(`Save failed: ${e?.message || JSON.stringify(e)}`);
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div className="max-w-lg mx-auto mt-4 bg-white rounded-lg shadow-xl border-t-4 border-blue-500">
      <div className="p-4 bg-blue-50 border-b flex justify-between items-center">
        <div className="flex flex-col">
          <h2 className="text-lg font-bold text-gray-800">In Call: {lead?.Name || "Unknown"}</h2>
          <span className="text-xs text-blue-600 font-mono">{lead?.Phone || "No Phone"}</span>
        </div>
        <a 
          href={lead?.id ? `https://crm.zoho.com/crm/tab/Leads/${lead.id}` : "#"} 
          target="_blank" 
          rel="noopener noreferrer"
          className="bg-green-600 text-white px-4 py-2 rounded text-xs font-bold shadow hover:bg-green-700 transition-all flex items-center justify-center min-w-[100px]"
          onClick={(e) => {
            if (!lead?.id) e.preventDefault();
            e.stopPropagation();
          }}
        >
          OPEN LEAD
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
          className="w-full py-3 mt-4 text-white bg-red-600 rounded hover:bg-red-700 font-bold shadow disabled:opacity-50 transition-colors"
        >
          {isSaving ? "Processing..." : "End Interaction & Next"}
        </button>
      </div>
    </div>
  );
}
