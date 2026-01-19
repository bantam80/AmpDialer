import React, { useEffect, useState } from 'react';
import { useZohoQueue } from './hooks/useZohoQueue';
import Login from './components/Login';
import Dialer from './components/Dialer';
import InCall from './components/InCall';
import Disposition from './components/Disposition';

export default function App() {
  const [session, setSession] = useState(null); 
  // States: IDLE, READY, CALLING, INCALL, DISPOSITION
  const [appState, setAppState] = useState('IDLE'); 
  
  useEffect(() => {
    /* Initialize Zoho SDK */
    window.ZOHO.embeddedApp.init();
  }, []);

  const { currentLead, loading, nextLead, isQueueFinished } = useZohoQueue();

  // 1. Dial Logic
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
        // Successful Dial -> Go to InCall
        setAppState('INCALL');
      } else if (resp.status === 400 || resp.status === 404) {
        handleAutoJunk("Invalid Number");
      } else if (resp.status === 401) {
        setSession(null); 
        setAppState('IDLE');
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

  // 2. Auto-Junk (Skip Logic)
  const handleAutoJunk = async (reason) => {
    await window.ZOHO.CRM.API.updateRecord({
      Entity: "Leads",
      APIData: { id: currentLead.id, Lead_Status: "Junk Lead" }
    });
    // Add note
    await window.ZOHO.CRM.API.createRecord({
      Entity: "Notes",
      APIData: {
        Parent_Id: currentLead.id,
        Note_Title: "Dialer Error",
        Note_Content: "Auto-skipped: " + reason
      }
    });
    nextLead();
    setAppState('READY');
  };

  // 3. End Call Handler
  const handleEndCall = () => {
    // Logic: InCall component handles the saving. 
    // We just move the queue here.
    nextLead();
    setAppState('READY');
  };

  // RENDER ROUTER
  if (!session) return <Login onLogin={(s) => { setSession(s); setAppState('READY'); }} />;
  if (loading) return <div className="p-10 text-center text-gray-500">Loading Queue...</div>;
  if (isQueueFinished) return <div className="p-10 text-center text-green-600 font-bold">Queue Completed!</div>;

  return (
    <div className="min-h-screen bg-gray-100 p-4">
      {appState === 'READY' && (
        <Dialer lead={currentLead} onDial={handleDial} />
      )}

      {appState === 'CALLING' && (
         <div className="text-center mt-20 animate-pulse font-bold text-xl">Dialing {currentLead.Phone}...</div>
      )}

      {appState === 'INCALL' && (
        <InCall lead={currentLead} onEndCall={handleEndCall} />
      )}

      {appState === 'DISPOSITION' && (
        <Disposition 
           lead={currentLead} 
           onSave={async (status) => {
              await window.ZOHO.CRM.API.updateRecord({
                 Entity: "Leads",
                 APIData: { id: currentLead.id, Lead_Status: status }
              });
              nextLead();
              setAppState('READY');
           }} 
        />
      )}
    </div>
  );
}
