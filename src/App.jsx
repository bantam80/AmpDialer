import React, { useEffect, useState } from 'react';
import { useZohoQueue } from './hooks/useZohoQueue';

// Sub-components (Placeholders)
const LoginScreen = ({ onLogin }) => <div>Login Form Here...</div>;
const Loading = () => <div>Loading Queue...</div>;
const Finished = () => <div>Queue Complete!</div>;

export default function App() {
  const [session, setSession] = useState(null); // Ringlogix Token
  const [appState, setAppState] = useState('IDLE'); // IDLE, READY, CALLING, DISPOSITION
  
  // Initialize Zoho SDK
  useEffect(() => {
    window.ZOHO.embeddedApp.init();
  }, []);

  // Use our custom hook
  const { currentLead, loading, nextLead, isQueueFinished } = useZohoQueue();

  // 1. Dial Handler
  const handleDial = async () => {
    setAppState('CALLING');
    
    try {
      const resp = await fetch('/api/dial', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`
        },
        body: JSON.stringify({
          uid: session.uid,
          domain: session.domain,
          destination: currentLead.Phone
        })
      });

      if (resp.status === 202) {
        // Success -> Move to Disposition
        // (Or In-Call if you have websocket events, but for now Disposition)
        setAppState('DISPOSITION');
      } else if (resp.status === 400 || resp.status === 404) {
        // AUTO-JUNK LOGIC
        await handleAutoJunk("Invalid Number / Unreachable");
      } else if (resp.status === 401) {
        setSession(null); // Logout
        alert("Session Expired");
      } else {
        alert("Dial Failed");
        setAppState('READY');
      }
    } catch (e) {
      console.error(e);
      setAppState('READY');
    }
  };

  // 2. Auto-Junk Logic
  const handleAutoJunk = async (reason) => {
    // A. Update Status
    await window.ZOHO.CRM.API.updateRecord({
      Entity: "Leads",
      APIData: { id: currentLead.id, Lead_Status: "Junk Lead" }
    });
    // B. Add Note
    await window.ZOHO.CRM.API.createRecord({
      Entity: "Notes",
      APIData: {
        Parent_Id: currentLead.id,
        Note_Title: "Dialer Error",
        Note_Content: `Auto-skipped by AmpDialer. Reason: ${reason}`
      }
    });
    // C. Skip
    nextLead();
    setAppState('READY');
  };

  // 3. Disposition Handler
  const handleDisposition = async (status) => {
    await window.ZOHO.CRM.API.updateRecord({
        Entity: "Leads",
        APIData: { id: currentLead.id, Lead_Status: status }
    });
    nextLead();
    setAppState('READY');
  }

  // RENDER LOGIC
  if (!session) return <LoginScreen onLogin={setSession} />;
  if (loading) return <Loading />;
  if (isQueueFinished) return <Finished />;

  return (
    <div className="p-4">
      <div className="card">
        <h2>{currentLead.Name}</h2>
        <p>{currentLead.Company}</p>
        <p className="text-xl font-bold">{currentLead.Phone}</p>
        
        {appState === 'READY' && (
             <button onClick={handleDial} className="btn-green">DIAL</button>
        )}

        {appState === 'CALLING' && <p>Dialing...</p>}

        {appState === 'DISPOSITION' && (
            <div className="disposition-grid">
                <button onClick={() => handleDisposition("Attempted to Contact")}>Attempted</button>
                <button onClick={() => handleDisposition("Contact in Future")}>Future</button>
                <button onClick={() => handleDisposition("Junk Lead")}>Junk</button>
                {/* ... other buttons */}
            </div>
        )}
      </div>
    </div>
  );
}
