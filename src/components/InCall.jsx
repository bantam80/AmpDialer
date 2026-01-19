// FILE: src/components/InCall.jsx
import React, { useMemo, useState } from "react";

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
  return insertRecordCompat({
    Entity: "Notes",
    APIData: { Parent_Id: RecordID, Note_Title: Title, Note_Content: Content }
  });
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
    {
      Subject: subject,
      Call_Type: "Outbound",
      "$se_module": "Leads",
      What_Id: leadId,
      Call_Start_Time: startedAtIso,
      Call_Duration: durationHHmm,
      Outbound_Call_Status: "Completed",
      Call_Result: resultText
    },
    {
      Subject: subject,
      Call_Type: "Outbound",
      "$se_module": "Leads",
      What_Id: leadId,
      Call_Start_Time: startedAtIso,
      Call_Duration: durationHHmm,
      Outgoing_Call_Status: "Completed",
      Call_Result: resultText
    },
    {
      Subject: subject,
      Call_Type: "Outbound",
      "$se_module": "Leads",
      What_Id: leadId,
      Call_Start_Time: startedAtIso,
      Call_Duration: durationHHmm
    }
  ];

  let lastErr = null;
  for (let i = 0; i < payloads.length; i++) {
    try {
      const resp = await insertRecordCompat({ Entity: "Calls", APIData: payloads[i] });
      console.log("Call insert OK (attempt " + (i + 1) + "):", resp);
      return resp;
    } catch (e) {
      lastErr = e;
      console.warn("Call insert failed (attempt " + (i + 1) + "):", e);
    }
  }
  throw lastErr || new Error("Call insert failed");
}

function isCallStillActive(upstreamBody, callid) {
  if (!callid) return false;
  if (!Array.isArray(upstreamBody)) return false;
  return upstreamBody.some(
    (c) => c && (c.orig_callid === callid || c.by_callid === callid || c.term_callid === callid)
  );
}

async function ringlogixDisconnectAndWait({ session, activeCall }) {
  const token = session?.access_token;
  const uid = activeCall?.uid || session?.uid;
  const callid = activeCall?.callid;

  if (!token || !uid || !callid) {
    throw new Error(
      `Missing disconnect inputs (token:${!!token}, uid:${!!uid}, callid:${!!callid}). Ensure /api/dial returns callid.`
    );
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
      discResp.status === 404 ||
      /not\s*found|no\s*active\s*call|already\s*ended|invalid\s*call/i.test(bodyText);

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

  // FIX: Email must NEVER close the widget or open the lead record.
  // - Stop click bubbling (prevents parent click handlers from firing).
  // - Prefer Zoho mailer if available; otherwise use mailto: (external).
  async function handleSendEmail(e) {
    try {
      e?.preventDefault?.();
      e?.stopPropagation?.();
    } catch {
      // ignore
    }

    const to = (lead?.Email || lead?.email || "").trim();
    if (!to) {
      alert("No email address on this lead.");
      return;
    }

    const mailSubject = `Following up: ${lead?.Name || "Lead"}`;

    // 1) Try Zoho/ZDK mailer (if present). This should not navigate away.
    try {
      if (window?.ZDK?.Client?.openMailer) {
        await window.ZDK.Client.openMailer({ to, subject: mailSubject });
        return;
      }
    } catch (err) {
      console.warn("ZDK.Client.openMailer failed; falling back to mailto:", err);
    }

    // 2) Safe fallback: external composer via mailto (does not close widget)
    try {
      const subjectEnc = encodeURIComponent(mailSubject);
      // Keep body minimal; you can expand later.
      const bodyEnc = encodeURIComponent(`Hi ${lead?.Name || ""},\n\n`);
      const url = `mailto:${encodeURIComponent(to)}?subject=${subjectEnc}&body=${bodyEnc}`;
      window.open(url, "_blank", "noopener,noreferrer");
      return;
    } catch (err) {
      console.warn("mailto fallback failed:", err);
    }

    alert("Unable to open an email composer. Please email the lead manually.");
  }

  async function handleSaveAndEnd() {
    setIsSaving(true);

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

    try {
      const ops = [];

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
        );
      }

      if (note?.trim()) ops.push(addNoteCompat({ RecordID: lead.id, Title: "Dialer Note", Content: note.trim() }));
      if (status && status !== lead.Status)
        ops.push(updateRecordCompat({ Entity: "Leads", APIData: { id: lead.id, Lead_Status: status } }));

      const results = await Promise.allSettled(ops);
      const failures = results.filter((r) => r.status === "rejected");
      if (failures.length) {
        console.error("Save failures:", failures);
        alert("Some items failed to save (likely Calls field requirements/picklists). Check console.");
      }

      onEndCall();
    } catch (e) {
      console.error("Error saving records:", e);
      alert("Error saving data to Zoho. Check console.");
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
          <p className="text-xs text-orange-600 mt-1">
            Warning: no callid captured (hangup/wait may not work for this call)
          </p>
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
          <select
            className="w-full p-2 mt-1 border rounded bg-white"
            value={status}
            onChange={(e) => setStatus(e.target.value)}
          >
            <option value="">-- Select Status --</option>
            {statusOptions.map((opt) => (
              <option key={opt} value={opt}>
                {opt}
              </option>
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
          onClick={(e) => handleSendEmail(e)}
          className="w-full py-3 text-white bg-blue-600 rounded hover:bg-blue-700 font-bold shadow"
        >
          Send Email (does not close widget)
        </button>
      </div>
    </div>
  );
}
