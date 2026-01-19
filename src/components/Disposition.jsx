import React from 'react';

export default function Disposition({ lead, onSave }) {
  const statusOptions = [
    "Attempted to Contact", "Contact in Future", "Junk Lead", 
    "Lost Lead", "Not Contacted", "Qualified", "Not Qualified", "Completed | Contacted"
  ];

  return (
    <div className="max-w-md mx-auto mt-10 bg-white rounded-lg shadow-lg p-6">
      <h2 className="text-xl font-bold mb-4">Select Disposition</h2>
      <p className="mb-4 text-gray-600">Call finished for <strong>{lead.Name}</strong>. Please select a result to proceed.</p>
      
      <div className="grid grid-cols-1 gap-3">
        {statusOptions.map(opt => (
            <button 
                key={opt}
                onClick={() => onSave(opt)}
                className="w-full text-left px-4 py-3 border rounded hover:bg-blue-50 hover:border-blue-300 transition-colors"
            >
                {opt}
            </button>
        ))}
      </div>
    </div>
  );
}
