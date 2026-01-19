import React, { useState } from 'react';

export default function InCall({ lead, onEndCall }) {
  const [note, setNote] = useState('');
  const [subject, setSubject] = useState('Call with ' + lead.Name);
  const [status, setStatus] = useState(lead.Status || '');
  const [isSaving, setIsSaving] = useState(false);

  // Options matching Zoho Lead_Status picklist
  const statusOptions = [
    "Attempted to Contact", "Contact in Future", "Junk Lead", 
    "Lost Lead", "Not Contacted", "Qualified", "Not Qualified", "Completed | Contacted"
  ];

  // 1. Drop VM Handler (Mock)
  const handleDropVM = async () => {
    // TODO: Call backend /api/drop-vm if available
    alert("Voicemail drop triggered (Mock)");
  };

  // 2. Save Logic (Notes/Tasks/Status)
  const handleSaveAndEnd = async () => {
    setIsSaving(true);
    try {
      // A. Create Task (If subject exists)
      if (subject) {
        await ZOHO.CRM.API.createRecord({
          Entity: "Tasks",
          APIData: {
            Subject: subject,
            Who_Id: lead.id,
            Status: "Completed",
            Priority: "Normal"
          }
        });
      }

      // B. Create Note (If note exists)
      if (note) {
        await ZOHO.CRM.API.createRecord({
          Entity: "Notes",
          APIData: {
            Parent_Id: lead.id,
            Note_Title: "Dialer Note",
            Note_Content: note
          }
        });
      }

      // C. Update Status (If changed)
      if (status && status !== lead.Status) {
        await ZOHO.CRM.API.updateRecord({
          Entity: "Leads",
          APIData: { id: lead.id, Lead_Status: status }
        });
      }
      
      // Proceed to Next
      onEndCall(); 
      
    } catch (e) {
      console.error("Error saving records:", e);
      alert("Error saving data to Zoho. Check console.");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="max-w-lg mx-auto mt-4 bg-white rounded-lg shadow-xl border-t-4 border-blue-500">
      {/* Header */}
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
        {/* Task Subject */}
        <div>
          <label className="block text-xs font-bold text-gray-500 uppercase">Task Subject</label>
          <input 
            type="text" 
            className="w-full p-2 mt-1 border rounded"
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
          />
        </div>

        {/* Note Area */}
        <div>
          <label className="block text-xs font-bold text-gray-500 uppercase">Add Note</label>
          <textarea 
            className="w-full p-2 mt-1 border rounded h-24"
            placeholder="Type notes here..."
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
        </div>

        {/* Status Dropdown */}
        <div>
          <label className="block text-xs font-bold text-gray-500 uppercase">Update Disposition</label>
          <select 
            className="w-full p-2 mt-1 border rounded bg-white"
            value={status}
            onChange={(e) => setStatus(e.target.value)}
          >
            <option value="">-- Select Status --</option>
            {statusOptions.map(opt => (
              <option key={opt} value={opt}>{opt}</option>
            ))}
          </select>
        </div>

        {/* Action Buttons */}
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
