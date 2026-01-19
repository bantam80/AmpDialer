import React, { useMemo, useState } from 'react';

function getCrmApi() {
  const api = window?.ZOHO?.CRM?.API;
  if (!api) throw new Error('ZOHO.CRM.API not available (Zoho not initialized or wrong context).');
  return api;
}

async function insertRecordCompat({ Entity, APIData }) {
  const api = getCrmApi();

  if (typeof api.insertRecord === 'function') {
    return api.insertRecord({ Entity, APIData });
  }

  // Rare fallback
  if (typeof api.createRecord === 'function') {
    return api.createRecord({ Entity, APIData });
  }

  console.error('Available API methods:', Object.keys(api));
  throw new Error('No supported record-create method found (expected insertRecord).');
}

async function updateRecordCompat({ Entity, APIData }) {
  const api = getCrmApi();
  if (typeof api.updateRecord === 'function') return api.updateRecord({ Entity, APIData });

  console.error('Available API methods:', Object.keys(api));
  throw new Error('updateRecord is not available in this SDK build.');
}

async function addNoteCompat({ Entity, RecordID, Title, Content }) {
  const api = getCrmApi();

  // Preferred method in many widget SDK builds
  if (typeof api.addNotes === 'function') {
    return api.addNotes({ Entity, RecordID, Title, Content });
  }

  // Fallback: insert into Notes module
  return insertRecordCompat({
    Entity: 'Notes',
    APIData: {
      Parent_Id: RecordID,
      Note_Title: Title,
      Note_Content: Content
    }
  });
}

// ---- Task creation that works with Leads ----
// Key change: link using What_Id + $se_module="Leads" (common requirement). :contentReference[oaicite:1]{index=1}
async function createTaskForLead({ leadId, subject }) {
  const today = new Date();
  const yyyy = today.getFullYear();
  const mm = String(today.getMonth() + 1).padStart(2, '0');
  const dd = String(today.getDate()).padStart(2, '0');
  const dueDate = `${yyyy}-${mm}-${dd}`;

  // We’ll try a few variants because each Zoho org can have different picklist values for Status/Priority.
  const attempts = [
    {
      Subject: subject,
      '$se_module': 'Leads',
      What_Id: leadId,
      Due_Date: dueDate,
      Status: 'Completed',
      Priority: 'Normal'
    },
    {
      Subject: subject,
      '$se_module': 'Leads',
      What_Id: leadId,
      Due_Date: dueDate,
      Status: 'Not Started',
      Priority: 'Normal'
    },
    {
      Subject: subject,
      '$se_module': 'Leads',
      What_Id: leadId,
      Due_Date: dueDate
    }
  ];

  let lastErr = null;

  for (let i = 0; i < attempts.length; i++) {
    try {
      const resp = await insertRecordCompat({
        Entity: 'Tasks',
        APIData: attempts[i]
      });

      // Many Zoho APIs return {data:[{code, message, status, details...}]}
      // We won’t over-parse; just log it for visibility.
      console.log('Task insert response (attempt ' + (i + 1) + '):', resp);
      return { ok: true, resp };
    } catch (e) {
      lastErr = e;
      console.warn('Task insert failed (attempt ' + (i + 1) + '):', e);
    }
  }

  return { ok: false, error: lastErr };
}

export default function InCall({ lead, onEndCall }) {
  const [note, setNote] = useState('');
  const [subject, setSubject] = useState('Call with ' + (lead?.Name || 'Lead'));
  const [status, setStatus] = useState(lead?.Status || '');
  const [isSaving, setIsSaving] = useState(false);

  const statusOptions = useMemo(
    () => [
      'Attempted to Contact',
      'Contact in Future',
      'Junk Lead',
      'Lost Lead',
      'Not Contacted',
      'Qualified',
      'Not Qualified',
      'Completed | Contacted'
    ],
    []
  );

  const handleSaveAndEnd = async () => {
    setIsSaving(true);

    try {
      const ops = [];

      // 1) Task (robust + retries)
      if (subject?.trim()) {
        ops.push(
          (async () => {
            const r = await createTaskForLead({ leadId: lead.id, subject: subject.trim() });
            if (!r.ok) throw r.error;
            return r;
          })()
        );
      }

      // 2) Note
      if (note?.trim()) {
        ops.push(
          addNoteCompat({
            Entity: 'Leads',
            RecordID: lead.id,
            Title: 'Dialer Note',
            Content: note.trim()
          })
        );
      }

      // 3) Lead Status
      if (status && status !== lead.Status) {
        ops.push(
          updateRecordCompat({
            Entity: 'Leads',
            APIData: { id: lead.id, Lead_Status: status }
          })
        );
      }

      const results = await Promise.allSettled(ops);
      const failures = results.filter((r) => r.status === 'rejected');

      if (failures.length) {
        console.error('Save failures:', failures);

        // Helpful debug: show the FIRST failure clearly
        const first = failures[0];
        alert('Some items failed to save (likely Task). Notes/Status may still be saved. Check console.');
      }

      onEndCall();
    } catch (e) {
      console.error('Error saving records:', e);
      alert('Error saving data to Zoho. Check console.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="max-w-lg mx-auto mt-4 bg-white rounded-lg shadow-xl border-t-4 border-blue-500">
      <div className="p-4 bg-blue-50 flex justify-between items-center border-b">
        <div>
          <h2 className="text-lg font-bold text-gray-800">In Call: {lead.Name}</h2>
          <p className="text-sm text-blue-600 font-mono">{lead.Phone}</p>
        </div>
      </div>

      <div className="p-6 space-y-4">
        <div>
          <label className="block text-xs font-bold text-gray-500 uppercase">Task Subject</label>
          <input
            type="text"
            className="w-full p-2 mt-1 border rounded"
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
          />
          <p className="text-xs text-gray-500 mt-1">
            Task links using <code>What_Id</code> + <code>$se_module=Leads</code>.
          </p>
        </div>

        <div>
          <label className="block text-xs font-bold text-gray-500 uppercase">Add Note</label>
          <textarea
            className="w-full p-2 mt-1 border rounded h-24"
            placeholder="Type notes here..."
            value={note}
            onChange={(e) => setNote(e.target.value)}
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
          {isSaving ? 'Saving...' : 'End Interaction & Next'}
        </button>
      </div>
    </div>
  );
}
