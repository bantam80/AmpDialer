import React, { useMemo, useState, useEffect } from "react";

function getCrmApi() {
  const api = window?.ZOHO?.CRM?.API;
  if (!api) throw new Error("ZOHO.CRM.API not available");
  return api;
}

async function insertRecordCompat({ Entity, APIData }) {
  const api = getCrmApi();
  if (typeof api.insertRecord === "function") return api.insertRecord({ Entity, APIData });
  if (typeof api.createRecord === "function") return api.createRecord({ Entity, APIData });
  console.error("Available ZOHO.CRM.API methods:", Object.keys(api));
  throw new Error("No supported record-create method found (expected insertRecord).");
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

// FIX: Helper to strip milliseconds from ISO string for strict Zoho validation
function toZohoDateTime(isoString) {
    if (!isoString) return new Date().toISOString().split('.')[0] + "Z";
    // Takes "2023-10-25T10:00:00.123Z" and returns "2023-10-25T10:00:00Z"
    return isoString.split('.')[0] + "Z";
}

async function createCallForLead({ leadId, subject, startedAtIso, durationHHmm, resultText }) {
  // Ensure the date format is strictly YYYY-MM-DDTHH:mm:ssZ (no ms)
  const safeStartTime = toZohoDateTime(startedAtIso);

  const payloads = [
    // 1. Standard Modern (Outbound_Call_Status)
    {
      Subject: subject,
      Call_Type: "Outbound",
      "$se_module": "Leads",
      What_Id: leadId,
      Call_Start_Time: safeStartTime,
      Call_Duration: durationHHmm,
      Outbound_Call_Status: "Completed",
      Call_Result: resultText
    },
    // 2. Legacy/Alternative (Outgoing_Call_Status)
    {
      Subject: subject,
      Call_Type: "Outbound",
      "$se_module": "Leads",
      What_Id: leadId,
      Call_Start_Time: safeStartTime,
      Call_Duration: durationHHmm,
      Outgoing_Call_Status: "Completed",
      Call_Result: resultText
    },
    // 3. Generic (Call_Status)
    {
      Subject: subject,
      Call_Type: "Outbound",
      "$se_module": "Leads",
      What_Id: leadId,
      Call_Start_Time: safeStartTime,
      Call_Duration: durationHHmm,
      Call_Status: "Completed",
      Call_Result: resultText
    },
    // 4. Minimal (No status/result - relies on defaults)
    {
      Subject: subject,
      Call_Type: "Outbound",
      "$se_module": "Leads",
      What_Id: leadId,
      Call_Start_Time: safeStartTime,
      Call_Duration: durationHHmm
    }
  ];

  let lastErr = null;
  for (let i = 0; i < payloads.length; i++) {
    try {
      const resp = await insertRecordCompat({ Entity: "Calls", APIData: payloads[i] });
      // Zoho API sometimes returns 200 but contains "status:error" in body
      if (resp && resp.data && Array.isArray(resp.data) && resp.data[0].status === "error") {
        throw new Error(JSON.stringify(resp.data[0]));
      }
      console.log("Call insert OK (attempt " + (i + 1) + "):", resp);
      return resp;
    } catch (e) {
      lastErr = e;
      console.warn(`Call insert attempt ${i + 1} failed:`, e);
    }
  }
  throw lastErr || new Error("Call insert failed after all attempts");
}

function isCallStillActive(upstreamBody, callid) {
  if (!callid) return false;
  if (!Array.isArray(upstreamBody)) return false;
  return upstreamBody.some((c) => c && (c.orig_callid === callid || c.by_callid === callid || c.term_callid === callid));
}

async function ringlogixDisconnectAndWait({ session, activeCall }) {
  const token = session?.access_token;
  const uid = activeCall?.uid || session?.uid;
  const callid = activeCall?.callid;

  if (!token || !uid || !callid) {
    throw new Error(`Missing disconnect inputs (token:${!!token}, uid:${!!uid}, callid:${!!callid}). Ensure /api/dial returns callid.`);
  }

  const discResp = await fetch("/api/hangup", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ uid, callid })
  });

  let discJson = null;
  try {
    discJson = await discResp.json();
  } catch {
    discJson = null;
  }

  if (!discResp.ok) {
    const bodyText = JSON.stringify(discJson || {});
    const alreadyEndedHint =
      discResp.status === 404 || /not\s*found|no\s*active\s*call|already\s*ended|invalid\s*call/i.test(bodyText);

    if (!alreadyEndedHint) {
      const msg = discJson?.message || discJson?.error || `Hangup failed (HTTP ${discResp.status})`;
      throw new Error(msg);
    }
  }

  const started = Date.now();
  const timeoutMs = 15000;
  const pollEveryMs = 750;
  let lastSnapshot = null;

  while (Date.now() - started < timeoutMs) {
    try {
      const r = await fetch(`/api/activeCalls?uid=${encodeURIComponent(uid)}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      const j = await r.json().catch(() => null);
      lastSnapshot = j;
      const upstreamBody = j?.upstreamBody;

      if (!Array.isArray(upstreamBody)) {
        const haystack = JSON.stringify(upstreamBody ?? j ?? {});
        const stillThereFallback = haystack.includes(callid);
        if (!stillThereFallback) return { ok: true, disconnected: true, via: "polled-active-calls-fallback" };
      } else {
        const stillThere = isCallStillActive(upstreamBody, callid);
        if (!stillThere) return { ok: true, disconnected: true, via: "polled-active-calls" };
      }
    } catch (e) {
      console.warn("activeCalls poll failed:", e);
    }
    await new Promise((res) => setTimeout(res, pollEveryMs));
  }

  console.warn("Hangup wait timed out; proceeding anyway.", { callid, lastSnapshot });
  return { ok: true, disconnected: true, via: "timeout-fallback", lastSnapshot };
}

export default function InCall({ lead, session, activeCall, onEndCall }) {
  const [note, setNote] = useState("");
  const [subject, setSubject] = useState("Call with " + (lead?.Name || "Lead"));
  const [status, setStatus] = useState(lead?.Status || "");
  const [isSaving, setIsSaving] = useState(false);
  const [isHangingUp, setIsHangingUp] = useState(false);
  const [leadUrl, setLeadUrl] = useState("#");

  const statusOptions = useMemo(
    () => [
      "Attempted to Contact",
      "Contact in Future",
      "Junk Lead",
      "Lost Lead",
      "Not Contacted",
      "Qualified",
      "Not Qualified",
      "Completed | Contacted"
    ],
    []
  );

  useEffect(() => {
    let baseUrl = "";
    try {
        const referrer = document.referrer || "";
        const match = referrer.match(/^(https:\/\/[^/]+\/crm\/([^/]+\/)?tab\/Leads)/i);
        if (match && match[1]) {
            baseUrl = match[1];
        } else {
            baseUrl = "https://crm.zoho.com/crm/tab/Leads";
        }
    } catch (e) {
        baseUrl = "https://crm.zoho.com/crm/tab/Leads";
    }

    if (lead?.id) {
        setLeadUrl(`${baseUrl}/${lead.id}`);
    }
  }, [lead]);

  function handleOpenLead(e) {
    e.preventDefault();
    e.stopPropagation();

    // Features string forces a new window/popup instead of a new tab
    const features = "width=1100,height=900,resizable=yes,scrollbars=yes,status=no,toolbar=no";
    
    // Attempt open
    const win = window.open(leadUrl, "_blank", features);

    if (!win) {
        alert("Pop-up blocked. Please allow pop-ups for this site to open the Lead record.");
    }
  }

  async function handleSaveAndEnd() {
    setIsSaving(true);
    
    // 1. Hangup Process
    try {
      setIsHangingUp(true);
      await ringlogixDisconnectAndWait({ session, activeCall });
    } catch (e) {
      console.error("Hangup failed:", e);
      alert(`Hangup failed. Not advancing.\n${e?.message || e}`);
      setIsHangingUp(false);
      setIsSaving(false);
      return;
    } finally {
      setIsHangingUp(false);
    }

    // 2. Save Process
    try {
      const ops = [];

      // Add Call Activity
      if (subject?.trim()) {
        const startedAtIso = activeCall?.startedAt || new Date().toISOString();
        const durationHHmm = msToHHmm(Date.now() - new Date(startedAtIso).getTime());
        const resultText = status || "Completed";
        ops.push(
          createCallForLead({ 
            leadId: lead.id, 
            subject: subject.trim(), 
            startedAtIso, 
            durationHHmm, 
            resultText 
          })
          .then(res => ({ status: 'fulfilled', value: res, type: 'Call' }))
          .catch(err => ({ status: 'rejected', reason: err, type: 'Call' }))
        );
      }

      // Add Note
      if (note?.trim()) {
        ops.push(
            addNoteCompat({ RecordID: lead.id, Title: "Dialer Note", Content: note.trim() })
            .then(res => ({ status: 'fulfilled', value: res, type: 'Note' }))
            .catch(err => ({ status: 'rejected', reason: err, type: 'Note' }))
        );
      }

      // Update Lead Status
      if (status && status !== lead.Status) {
        ops.push(
            updateRecordCompat({ Entity: "Leads", APIData: { id: lead.id, Lead_Status: status } })
            .then(res => ({ status: 'fulfilled', value: res, type: 'LeadStatus' }))
            .catch(err => ({ status: 'rejected', reason: err, type: 'LeadStatus' }))
        );
      }

      // Await all operations
      const results = await Promise.all(ops);
      const failures = results.filter((r) => r.status === "rejected");

      if (failures.length > 0) {
        console.error("Save failures:", failures);
        
        // Extract readable error messages
        const errorMessages = failures.map(f => {
            const errObj = f.reason;
            // Try to parse ZOHO API error format
            let msg = errObj.message || JSON.stringify(errObj);
            try {
                if (typeof msg === 'string' && msg.includes('{')) {
                    const parsed = JSON.parse(msg);
                    if (parsed.message) msg = parsed.message;
                    if (parsed.details) msg += ` (${JSON.stringify(parsed.details)})`;
                }
            } catch(e) {}
            return `${f.type} failed: ${msg}`;
        }).join("\n");

        alert(`Data partially failed to save:\n${errorMessages}\n\nCheck browser console for full details.`);
      }

      onEndCall();
    } catch (e) {
      console.error("Critical error saving records:", e);
      alert("Critical error saving data. Check console.");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div className="max-w-lg mx-auto mt-4 bg-white rounded-lg shadow-xl border-t-4 border-blue-500">
      <div className="p-4 bg-blue-50 border-b">
        <h2 className="text-lg font-bold text-gray-800">In Call: {lead?.Name}</h2>
        <p className="text-sm text-blue-600 font-mono">{lead?.Phone}</p>
        {activeCall?.callid ? (
          <p className="text-xs text-gray-500 mt-1 font-mono">callid: {activeCall.callid}</p>
        ) : (
          <p className="text-xs text-orange-600 mt-1">Warning: no callid captured (hangup/wait may not work for this call)</p>
        )}
      </div>

      <div className="p-6 space-y-4">
        <div>
          <label className="block text-xs font-bold text-gray-500 uppercase">Call Subject</label>
          <input
            type="text"
            className="w-full p-2 mt-1 border rounded"
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
          />
          <p className="text-xs text-gray-500 mt-1">
            Logs a Call activity (module Calls) linked via What_Id + $se_module=Leads (no Who_Id).
          </p>
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
            {statusOptions.map((opt) => (
              <option key={opt} value={opt}>{opt}</option>
            ))}
          </select>
        </div>

        <button
          onClick={handleSaveAndEnd}
          disabled={isSaving}
          className="w-full py-3 mt-4 text-white bg-red-600 rounded hover:bg-red-700 font-bold shadow"
        >
          {isSaving ? (isHangingUp ? "Hanging up..." : "Saving...") : "End Interaction & Next"}
        </button>

        <button
          type="button"
          onClick={handleOpenLead}
          className="w-full py-3 text-white bg-blue-600 rounded hover:bg-blue-700 font-bold shadow"
        >
          Open Lead Record (Window)
        </button>
      </div>
    </div>
  );
}
