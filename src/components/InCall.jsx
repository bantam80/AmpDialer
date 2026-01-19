import React, { useMemo, useState } from 'react';

function getCrmApi() {
  const api = window?.ZOHO?.CRM?.API;
  if (!api) throw new Error('ZOHO.CRM.API not available (Zoho not initialized or wrong context).');
  return api;
}

// Compatibility layer: some SDK builds have insertRecord/addNotes, not createRecord
async function insertRecordCompat({ Entity, APIData }) {
  const api = getCrmApi();

  if (typeof api.insertRecord === 'function') {
    return api.insertRecord({ Entity, APIData });
  }

  // Fallback only if your build actually has createRecord
  if (typeof api.createRecord === 'function') {
    return api.createRecord({ Entity, APIData });
  }

  console.error('Available API methods:', Object.keys(api));
  throw new Error('No supported record-create method found (expected insertRecord).');
}

async function addNoteCompat({ Entity, RecordID, Title, Content }) {
  const api = getCrmApi();

  // Preferred: addNotes attaches to the record directly
  if (typeof api.addNotes === 'function') {
    return api.addNotes({ Entity, RecordID, Title, Content });
  }

  // Fallback: try inserting into Notes module (not always enabled in every build)
  return insertRecordCompat({
    Entity: 'Notes',
    APIData: {
      Parent_Id: RecordID,
      Note_Title: Title,
      Note_Content: Content
    }
  });
}

async function updateRecordCompat({ Entity, APIData }) {
  const api = getCrmApi();

  if (typeof api.updateRecord === 'function') {
    return api.updateRecord({ Entity, APIData });
  }

  console.error('Available API methods:', Object.keys(api));
  throw new Error('updateRecord is not available in this SDK build.');
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

  const handleDropVM = async () => {
    alert('Voicemail drop triggered (Mock)');
  };

  const handleSaveAndEnd = async () => {
    setIsSaving(true);

    try {
      // Build a list of operations; run them in parallel but don’t fail the entire “Next” on one error.
      const ops = [];

      // A) Task
      if (subject?.trim()) {
        ops.push(
          insertRecordCompat({
            Entity: 'Tasks',
            APIData: {
              Subject: subject.trim(),
              Who_Id: lead.id, // If this ever fails, we’ll adjust to What_Id / $se_module based on your org config
              Status: 'Completed',
              Priority: 'Normal'
            }
          })
        );
      }

      // B) Note
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

      // C) Update Lead Status
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
        alert('Some items failed to save. Check console for details. Moving to next lead anyway.');
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

        <button
          onClick={handleDropVM}
          className="px-3 py-1 text-xs font-bold text-blue-700 border border-blue-300 rounded hover:bg-blue-100"
        >
          📼 Drop VM
        </button>
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
