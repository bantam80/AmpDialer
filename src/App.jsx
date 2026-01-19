import React, { useEffect, useState } from 'react';
import { useZohoQueue } from './hooks/useZohoQueue';
import Login from './components/Login';
import Dialer from './components/Dialer';
import InCall from './components/InCall';
import Disposition from './components/Disposition';

const [zohoReady, setZohoReady] = useState(false);
const [detectedCvid, setDetectedCvid] = useState(null);


export default function App() {
  const [session, setSession] = useState(null); 
  // States: IDLE, READY, CALLING, INCALL, DISPOSITION
  const [appState, setAppState] = useState('IDLE'); 
  
  useEffect(() => {
  const hasZoho =
    typeof window !== "undefined" &&
    window.ZOHO &&
    window.ZOHO.embeddedApp &&
    typeof window.ZOHO.embeddedApp.init === "function";

  if (!hasZoho) {
    console.warn("ZOHO SDK not available (standalone mode).");
    return;
  }

  window.ZOHO.embeddedApp.on("PageLoad", function (data) {
    console.log("ZOHO PageLoad payload:", data);
    if (data?.cvid) setDetectedCvid(String(data.cvid));
  });

  window.ZOHO.embeddedApp
    .init()
    .then(() => {
      console.log("Zoho embeddedApp.init() OK");
      setZohoReady(true);
    })
    .catch((e) => console.error("Zoho init failed", e));
}, []);



  const { currentLead, loading, nextLead, isQueueFinished } = useZohoQueue();

  // 1. Dial Logic
  const handleDial = async (lead) => {
  try {
    setErrorMessage("");

    // Basic guard: need session + lead phone
    if (!session?.access_token) {
      setErrorMessage("No active session. Please log in again.");
      setAppState("LOGIN");
      return;
    }
    if (!lead?.Phone) {
      setErrorMessage("Lead has no phone number.");
      setAppState("DISPOSITION");
      return;
    }

    const payload = {
      uid: session.uid,
      domain: session.domain,
      destination: lead.Phone.replace(/\D/g, ""), // keep digits only (expect 10-digit here)
    };

    const resp = await fetch("/api/dial", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${session.access_token}`,
      },
      body: JSON.stringify(payload),
    });

    const data = await resp.json().catch(() => ({}));

    // Contract: our API returns 200 on success with { ok:true, upstreamStatus:202 }
    // and returns upstream status on failure with { ok:false, upstreamStatus:401, ... }
    if (data.ok === true) {
      setCallId(data.callid || null);
      setCurrentLead(lead);
      setAppState("INCALL");
      return;
    }

    // Failure path
    const upstream = data.upstreamStatus ? ` (upstream ${data.upstreamStatus})` : "";
    setErrorMessage((data.error || "Dial failed") + upstream);
    setAppState("DISPOSITION");
  } catch (e) {
    setErrorMessage("Dial failed due to network/server error.");
    setAppState("DISPOSITION");
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
