import React, { useMemo, useState } from 'react';

function getCrmApi() {
  const api = window?.ZOHO?.CRM?.API;
  if (!api) throw new Error('ZOHO.CRM.API not available');
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

  console.error('Available ZOHO.CRM.API methods:', Object.keys(api));
  throw new Error('No supported record-create method found (expected insertRecord).');
}

async function updateRecordCompat({ Entity, APIData }) {
  const api = getCrmApi();
  if (typeof api.updateRecord === 'function') return api.updateRecord({ Entity, APIData });
  throw new Error('updateRecord not available');
}

async function addNoteCompat({ Entity, RecordID, Title, Content }) {
  const api = getCrmApi();

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

/**
 * Task create for a Lead:
 * IMPORTANT: Do NOT send Who_Id (Zoho rejects it in your org for Leads).
 * Use What_Id + $se_module="Leads" instead.
 */
async function createTaskForLead({ leadId, subject }) {
  const today = new Date();
  const yyyy = today.getFullYear();
  const mm = String(today.getMonth() + 1).padStart(2, '0');
  const dd = String(today.getDate()).padStart(2, '0');
  const dueDate = `${yyyy}-${mm}-${dd}`;

  // No Who_Id anywhere. Only What_Id + $se_module.
  const payloads = [
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

  for (let i = 0; i < payloads.length; i++) {
    try {
      const resp = await insertRecordCompat({
        Entity: 'Tasks',
        APIData: payloads[i]
      });

      console.log('Task insert OK (attempt ' + (i + 1) + '):', resp);
      return resp;
    } catch (e) {
      lastErr = e;
      console.warn('Task insert failed (attempt ' + (i + 1) + '):', e);
    }
  }

  throw lastErr || new Error('Task insert failed');
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

      // 1) Create Task (linked to Lead using What_Id + $se_module)
      if (subject?.trim()) {
        ops.push(createTaskForLead({ leadId: lead.id, subject: subject.trim() }));
      }

      // 2) Add Note
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

      // 3) Update Lead status
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
        alert('Some items failed to save (likely Task field requirements). Check console.');
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
      <div className="p-4 bg-blue-50 border-b">
        <h2 className="text-lg font-bold text-gray-800">In Call: {lead?.Name}</h2>
        <p className="text-sm text-blue-600 font-mono">{lead?.Phone}</p>
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
            Task links via <code>What_Id</code> + <code>$se_module=Leads</code> (no <code>Who_Id</code>).
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
          {isSaving ? 'Saving...' : 'End Interaction & Next'}
        </button>
      </div>
    </div>
  );
}
