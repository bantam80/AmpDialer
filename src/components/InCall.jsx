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

// Helper to strip milliseconds from ISO string for strict Zoho validation
function toZohoDateTime(isoString) {
    if (!isoString) return new Date().toISOString().split('.')[0] + "Z";
    return isoString.split('.')[0] + "Z";
}

// Calculates future start time based on selected date + current time rounded to nearest 30m
function calculateScheduledTime(dateString) {
    if (!dateString) return null;
    
    const now = new Date();
    // Round minutes to 0 or 30
    let minutes = now.getMinutes();
    let addHours = 0;
    
    if (minutes < 15) {
        minutes = 0;
    } else if (minutes < 45) {
        minutes = 30;
    } else {
        minutes = 0;
        addHours = 1;
    }
    
    // Create base date from the picker (YYYY-MM-DD)
    const [y, m, d] = dateString.split('-').map(Number);
    const target = new Date(y, m - 1, d, now.getHours() + addHours, minutes, 0);

    return toZohoDateTime(target.toISOString());
}

async function createCallForLead({ leadId, subject, startedAtIso, durationHHmm, resultText }) {
  const safeStartTime = toZohoDateTime(startedAtIso);
  const payloads = [
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

async function createScheduledCall({ leadId, startTime, agenda }) {
    const payload = {
        Subject: "Follow Up Call",
        Call_Type: "Outbound",
        "$se_module": "Leads",
        What_Id: leadId,
        Call_Start_Time: startTime,
        Call_Purpose: "Prospecting", // v1.1.3 Requirement
        Agenda: agenda || "",        // v1.1.3 Requirement
        Call_Status: "Scheduled",    // Standard for future calls
        Send_Notification: false
    };

    // Try Standard insert first
    try {
        const resp = await insertRecordCompat({ Entity: "Calls", APIData: payload });
        if (resp && resp.data && Array.isArray(resp.data) && resp.data[0].status === "error") {
             // If "Agenda" fails (some layouts use Description), fallback
             console.warn("Scheduled Call insert failed on Agenda, retrying with Description...", resp.data[0]);
             const fallbackPayload = { ...payload };
             delete fallbackPayload.Agenda;
             fallbackPayload.Description = agenda || "";
             return await insertRecordCompat({ Entity: "Calls", APIData: fallbackPayload });
        }
        return resp;
    } catch (e) {
        throw e;
    }
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
  
  // v1.1.3: Follow Up Date State
  const [followUpDate, setFollowUpDate] = useState("");

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
    const features = "width=1100,height=900,resizable=yes,scrollbars=yes,status=no,toolbar=no";
    const win = window.open(leadUrl, "_blank", features);
    if (!win) {
        alert("Pop-up blocked. Please allow pop-ups for this site to open the Lead record.");
    }
  }

  async function handleSaveAndEnd() {
    // Validation: If Contact in Future, Date is required
    if (status === "Contact in Future" && !followUpDate) {
        alert("Please select a Follow Up Date.");
        return;
    }

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

      // A. Standard Call Log (Past Activity)
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
          .then(res => ({ status: 'fulfilled', value: res, type: 'Log Call' }))
          .catch(err => ({ status: 'rejected', reason: err, type: 'Log Call' }))
        );
      }

      // B. Note
      if (note?.trim()) {
        ops.push(
            addNoteCompat({ RecordID: lead.id, Title: "Dialer Note", Content: note.trim() })
            .then(res => ({ status: 'fulfilled', value: res, type: 'Note' }))
            .catch(err => ({ status: 'rejected', reason: err, type: 'Note' }))
        );
      }

      // C. Lead Field Updates
      const leadUpdateData = { id: lead.id };
      let hasUpdate = false;

      if (status && status !== lead.Status) {
        leadUpdateData.Lead_Status = status;
        hasUpdate = true;
      }

      if (status === "Contact in Future") {
          leadUpdateData.Follow_Up_Date = followUpDate;       // v1.1.3 Requirement
          // Campaign Assignment removed (handled by Workflow Rules)
          hasUpdate = true;
      }

      if (hasUpdate) {
        ops.push(
            updateRecordCompat({ Entity: "Leads", APIData: leadUpdateData })
            .then(res => ({ status: 'fulfilled', value: res, type: 'Lead Update' }))
            .catch(err => ({ status: 'rejected', reason: err, type: 'Lead Update' }))
        );
      }

      // D. Schedule Future Call (v1.1.3)
      if (status === "Contact in Future") {
          const scheduledTime = calculateScheduledTime(followUpDate);
          ops.push(
              createScheduledCall({ leadId: lead.id, startTime: scheduledTime, agenda: note })
              .then(res => ({ status: 'fulfilled', value: res, type: 'Schedule Call' }))
              .catch(err => ({ status: 'rejected', reason: err, type: 'Schedule Call' }))
          );
      }

      // Execute all operations
      const results = await Promise.all(ops);
      const failures = results.filter((r) => r.status === "rejected");

      if (failures.length > 0) {
        console.error("Save failures:", failures);
        
        const errorMessages = failures.map(f => {
            const errObj = f.reason;
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

        {/* v1.1.3: Date Picker triggers only on specific disposition */}
        {status === "Contact in Future" && (
            <div className="p-3 bg-yellow-50 border border-yellow-200 rounded animate-fade-in">
                <label className="block text-xs font-bold text-yellow-700 uppercase mb-1">
                    Select Follow Up Date *
                </label>
                <input 
                    type="date"
                    className="w-full p-2 border rounded border-yellow-400"
                    value={followUpDate}
                    onChange={(e) => setFollowUpDate(e.target.value)}
                    min={new Date().toISOString().split('T')[0]} // Disable past dates
                />
                <p className="text-xs text-yellow-600 mt-1">
                    This will schedule a call for this date (at current time rounded to nearest 30m) and update the lead's Follow Up Date.
                </p>
            </div>
        )}

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
