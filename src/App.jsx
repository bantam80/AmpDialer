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

  // Zoho readiness + current list view (CVID)
  const [hasZoho, setHasZoho] = useState(false);
  const [zohoReady, setZohoReady] = useState(false);
  const [detectedCvid, setDetectedCvid] = useState(null);

  useEffect(() => {
    const ok =
      typeof window !== 'undefined' &&
      window.ZOHO &&
      window.ZOHO.embeddedApp &&
      typeof window.ZOHO.embeddedApp.init === 'function';

    if (!ok) {
      console.warn('ZOHO SDK not available (standalone mode).');
      setHasZoho(false);
      return;
    }

    setHasZoho(true);

    // Capture list-view context (including cvid)
    window.ZOHO.embeddedApp.on('PageLoad', function (data) {
      console.log('ZOHO PageLoad payload:', data);
      if (data?.cvid) setDetectedCvid(String(data.cvid));
    });

    window.ZOHO.embeddedApp
      .init()
      .then(() => {
        console.log('Zoho embeddedApp.init() OK');
        setZohoReady(true);
      })
      .catch((e) => console.error('Zoho init failed', e));
  }, []);

  const {
    views,
    selectedViewId,
    setActiveView,
    currentLead,
    loading,
    nextLead,
    queueRemaining,
    isQueueFinished
  } = useZohoQueue({ zohoReady, initialCvid: detectedCvid });

  // ---- Dial Logic (robust to different /api/dial response shapes) ----
  const handleDial = async () => {
    if (!session?.access_token) {
      setSession(null);
      setAppState('IDLE');
      return;
    }
    if (!currentLead?.Phone) {
      await handleAutoJunk('Missing Phone');
      return;
    }

    setAppState('CALLING');

    try {
      const resp = await fetch('/api/dial', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`
        },
        body: JSON.stringify({
          uid: session.uid,
          domain: session.domain,
          destination: String(currentLead.Phone).replace(/\D/g, '')
        })
      });

      // Some versions return empty body on success; don’t crash on json()
      let data = null;
      try {
        data = await resp.json();
      } catch {
        data = null;
      }

      const upstreamStatus = data?.upstreamStatus ?? resp.status;

      // Success if upstream accepted OR your proxy returned ok:true
      const success =
        upstreamStatus === 202 ||
        data?.ok === true ||
        (resp.status === 202) ||
        (resp.status === 200 && (data === null || Object.keys(data || {}).length === 0));

      if (success) {
        setAppState('INCALL');
        return;
      }

      // Invalid number types
      if (upstreamStatus === 400 || upstreamStatus === 404) {
        await handleAutoJunk('Invalid Number');
        return;
      }

      // Auth/session expired
      if (upstreamStatus === 401 || upstreamStatus === 403) {
        setSession(null);
        setAppState('IDLE');
        alert('Session Expired');
        return;
      }

      alert(`Dial Failed${upstreamStatus ? ` (upstream ${upstreamStatus})` : ''}`);
      setAppState('READY');
    } catch (e) {
      console.error(e);
      setAppState('READY');
    }
  };

  // ---- Auto-Junk (Skip Logic) ----
  const handleAutoJunk = async (reason) => {
    try {
      if (!zohoReady || !window.ZOHO?.CRM?.API?.updateRecord || !window.ZOHO?.CRM?.API?.createRecord) {
        console.warn('Zoho CRM API not ready; cannot auto-junk. Skipping in UI only.');
        await nextLead();
        setAppState('READY');
        return;
      }

      await window.ZOHO.CRM.API.updateRecord({
        Entity: 'Leads',
        APIData: { id: currentLead.id, Lead_Status: 'Junk Lead' }
      });

      await window.ZOHO.CRM.API.createRecord({
        Entity: 'Notes',
        APIData: {
          Parent_Id: currentLead.id,
          Note_Title: 'Dialer Error',
          Note_Content: 'Auto-skipped: ' + reason
        }
      });

      await nextLead();
      setAppState('READY');
    } catch (e) {
      console.error('Auto-junk failed:', e);
      await nextLead();
      setAppState('READY');
    }
  };

  // ---- End Call Handler ----
  const handleEndCall = async () => {
    await nextLead();
    setAppState('READY');
  };

  // RENDER ROUTER
  if (!session) {
    return (
      <Login
        onLogin={(s) => {
          setSession(s);
          setAppState('READY');
        }}
      />
    );
  }

  // If we're inside Zoho, wait for init before using Zoho APIs
  if (hasZoho && !zohoReady) {
    return <div className="p-10 text-center text-gray-500">Initializing Zoho...</div>;
  }

  if (loading) return <div className="p-10 text-center text-gray-500">Loading Queue...</div>;
  if (isQueueFinished) return <div className="p-10 text-center text-green-600 font-bold">Queue Completed!</div>;

  return (
    <div className="min-h-screen bg-gray-100 p-4">
      {/* View Selector (dropdown) */}
      {views?.length > 0 && (
        <div className="max-w-md mx-auto mb-3 bg-white rounded-lg shadow p-3 flex items-center gap-3">
          <div className="text-xs font-bold text-gray-500 uppercase">List View</div>

          <select
            className="flex-1 border rounded p-2 bg-white"
            value={selectedViewId || ''}
            onChange={(e) => setActiveView(e.target.value)}
          >
            {views.map((v) => (
              <option key={v.id} value={v.id}>
                {v.display_value}
              </option>
            ))}
          </select>

          <div className="text-sm text-gray-600 whitespace-nowrap">Remaining: {queueRemaining}</div>
        </div>
      )}

      {appState === 'READY' && <Dialer lead={currentLead} onDial={handleDial} />}

      {appState === 'CALLING' && (
        <div className="text-center mt-20 animate-pulse font-bold text-xl">Dialing {currentLead.Phone}...</div>
      )}

      {appState === 'INCALL' && <InCall lead={currentLead} onEndCall={handleEndCall} />}

      {appState === 'DISPOSITION' && (
        <Disposition
          lead={currentLead}
          onSave={async (status) => {
            if (zohoReady && window.ZOHO?.CRM?.API?.updateRecord) {
              await window.ZOHO.CRM.API.updateRecord({
                Entity: 'Leads',
                APIData: { id: currentLead.id, Lead_Status: status }
              });
            }
            await nextLead();
            setAppState('READY');
          }}
        />
      )}
    </div>
  );
}
