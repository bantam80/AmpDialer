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

  // Track the currently active Ringlogix call so InCall can hang up + wait before advancing
  const [activeCall, setActiveCall] = useState(null);

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

  const doLogout = (reason) => {
    console.warn('Logging out:', reason);
    setSession(null);
    setActiveCall(null);
    setAppState('IDLE');
  };

  // ---- Dial Logic (robust to different /api/dial response shapes) ----
  const handleDial = async () => {
    if (!session?.access_token) {
      doLogout('Missing session token');
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

      // Success if upstream accepted OR proxy returned ok:true
      const success =
        upstreamStatus === 202 ||
        data?.ok === true ||
        resp.status === 202 ||
        (resp.status === 200 && (data === null || Object.keys(data || {}).length === 0));

      if (success) {
        // Capture call context for hangup + wait
        const callid = data?.callid || null;

        setActiveCall({
          callid,
          destination: data?.destination || null,
          uid: session.uid,
          domain: session.domain,
          startedAt: new Date().toISOString()
        });

        if (!callid) {
          // Not fatal (some proxies can return empty body), but hangup will require callid.
          console.warn('Dial succeeded but no callid returned. Hangup feature will be limited for this call.');
        }

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
        alert('Session Expired');
        doLogout(`Dial returned ${upstreamStatus}`);
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
      setActiveCall(null);

      // NOTE: This uses createRecord for Notes; some Zoho contexts may not support it.
      // If you want this hardened, we’ll extract the compat helpers from InCall into a shared util.
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

  // ---- End Call Handler (InCall will do hangup + wait + save, then call this) ----
  const handleEndCall = async () => {
    setActiveCall(null);
    await nextLead();
    setAppState('READY');
  };

  // RENDER ROUTER
  if (!session) {
    return (
      <Login
        onLogin={(s) => {
          setSession(s);
          setActiveCall(null);
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
        <div className="text-center mt-20 animate-pulse font-bold text-xl">
          Dialing {currentLead?.Phone}...
        </div>
      )}

      {appState === 'INCALL' && (
        <InCall
          lead={currentLead}
          session={session}
          activeCall={activeCall}
          onEndCall={handleEndCall}
        />
      )}

      {appState === 'DISPOSITION' && (
        <Disposition
          lead={currentLead}
          onSave={async (status) => {
            try {
              if (zohoReady && window.ZOHO?.CRM?.API?.updateRecord) {
                await window.ZOHO.CRM.API.updateRecord({
                  Entity: 'Leads',
                  APIData: { id: currentLead.id, Lead_Status: status }
                });
              }
            } catch (e) {
              console.error('Disposition save failed:', e);
            }

            setActiveCall(null);
            await nextLead();
            setAppState('READY');
          }}
        />
      )}

      {/* Optional: quick logout control (kept subtle) */}
      <div className="max-w-md mx-auto mt-4 text-center">
        <button
          className="text-xs text-gray-500 hover:text-gray-700 underline"
          onClick={() => doLogout('User clicked logout')}
        >
          Logout
        </button>
      </div>
    </div>
  );
}
