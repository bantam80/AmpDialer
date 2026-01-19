import React from 'react';

export default function Dialer({ lead, onDial }) {
  if (!lead) return <div className="p-10 text-center">No leads available.</div>;

  return (
    <div className="max-w-md mx-auto mt-10 overflow-hidden bg-white rounded-lg shadow-lg">
      <div className="px-6 py-4 bg-gray-50 border-b">
        <h2 className="text-xl font-bold text-gray-800">{lead.Name}</h2>
        <p className="text-sm text-gray-600">{lead.Company}</p>
      </div>
      
      <div className="p-6 text-center">
        <div className="mb-6">
          <span className="block text-xs font-bold tracking-wider text-gray-500 uppercase">Phone</span>
          <span className="text-3xl font-bold text-gray-900">{lead.Phone}</span>
        </div>

        <button 
          onClick={onDial}
          className="w-full px-6 py-4 text-xl font-bold text-white transition-colors bg-green-500 rounded-full hover:bg-green-600 shadow-md"
        >
          📞 DIAL NOW
        </button>

        <div className="mt-4 text-sm text-gray-400">
          Status: {lead.Status || "New"}
        </div>
      </div>
    </div>
  );
}
