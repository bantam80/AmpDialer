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

// More robust email extractor (handles casing / alternate keys)
function extractEmail(lead) {
  if (!lead || typeof lead !== "object") return "";

  // Common direct keys used in this app + potential variations
  const direct =
    lead.Email ||
    lead.email ||
    lead.Email_ID ||
    lead.email_id ||
    lead.Secondary_Email ||
    lead.secondary_email;

  if (typeof direct === "string" && direct.trim()) return direct.trim();

  // Case-insensitive scan: any key whose name is exactly "email" (ignoring case)
  for (const k of Object.keys(lead)) {
    if (String(k).toLowerCase() === "email") {
      const v = lead[k];
      if (typeof v === "string" && v.trim()) return v.trim();
    }
  }

  return "";
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

  // FIX: Email must NEVER close widget or open lead record.
  // Also: if email missing in lead object, log keys so we can see what Zoho returned.
  async function handleSendEmail(e) {
    try {
      e?.preventDefault?.();
      e?.stopPropagation?.();
    } catch {
      // ignore
    }

    const to = extractEmail(lead);

    if (!to) {
      console.warn("Send Email: lead has no Email in queue object.", {
        lead,
        leadKeys: lead ? Object.keys(lead) : null
      });

      alert(
        "No email address on this lead (in the queue payload).\n\n" +
          "This usually means Email wasn't returned by the list fetch.\n" +
          "Fix: ensure useZohoQueue fetchLeads() includes fields with Email."
      );
      return;
    }

    const mailSubject = `Following up: ${lead?.Name || "Lead"}`;

    // 1) Try ZDK mailer (if present). This should not navigate away.
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
      const bodyEnc = encodeURIComponent(`Hi ${lead?.Name || ""},\n\n`);
      const url = `mailto:${encodeURIComponent(to)}?subject=${subjectEnc}&body
