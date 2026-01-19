import { useState, useEffect } from 'react';

// Initialize ZOHO SDK globally in main.jsx, but we use it here
// window.ZOHO is available

export function useZohoQueue() {
  const [queue, setQueue] = useState([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const [viewId, setViewId] = useState(null);
  const [pageToken, setPageToken] = useState(null); // For >2000 records
  const [page, setPage] = useState(1); // For <2000 records
  const hasZohoCRM =
  typeof window !== "undefined" &&
  window.ZOHO &&
  window.ZOHO.CRM &&
  window.ZOHO.CRM.API &&
  window.ZOHO.CRM.META;

  // 1. Init & Get View ID
  useEffect(() => {
  async function initQueue() {
    if (!hasZohoCRM) {
      console.warn("Zoho CRM SDK not available. Using mock queue in standalone mode.");
      setQueue([
        { id: "mock1", Name: "Mock Lead 1", Phone: "7703774730", Company: "MockCo", Status: "New" },
        { id: "mock2", Name: "Mock Lead 2", Phone: "4043693678", Company: "MockCo", Status: "New" }
      ]);
      setLoading(false);
      return;
    }

    try {
      const views = await window.ZOHO.CRM.META.getCustomViews({ module: "Leads" });
      const targetView =
        views.data.find(v => v.display_value === "Lead Source") || views.data[0];
      if (targetView) {
        setViewId(targetView.id);
        fetchLeads(targetView.id, 1, null);
      }
    } catch (e) {
      console.error("Zoho View Load Error", e);
      setLoading(false);
    }
  }
  initQueue();
}, []);


  // 2. Fetch Logic
  async function fetchLeads(cvid, pageNum, token) {
    setLoading(true);
    let params = {
        Entity: "Leads",
        cvid: cvid,
        per_page: 200 
    };

    if (token) {
        params.page_token = token; // >2000 mode
    } else {
        params.page = pageNum; // <2000 mode
    }

    try {
        const resp = await window.ZOHO.CRM.API.getRecords(params);
        if (resp.data) {
            // Filter invalid records (no phone) if desired
            const validLeads = resp.data.map(r => ({
                id: r.id,
                Name: `${r.First_Name} ${r.Last_Name}`,
                Phone: r.Phone ? r.Phone.replace(/\D/g, '') : '', 
                Company: r.Company,
                Status: r.Lead_Status
            })).filter(l => l.Phone.length > 9); // Basic validation

            setQueue(prev => [...prev, ...validLeads]);
            
            // Check for next token
            if (resp.info && resp.info.more_records) {
                if (resp.info.next_page_token) {
                    setPageToken(resp.info.next_page_token);
                    setPage(null); // Switch mode
                } else {
                    setPage(pageNum + 1);
                }
            }
        }
    } catch (e) {
        console.error("Fetch Error", e);
    } finally {
        setLoading(false);
    }
  }

  // 3. Advance & Lazy Load Trigger
  const nextLead = () => {
    const nextIdx = currentIndex + 1;
    setCurrentIndex(nextIdx);

    // If we are 20 records from the end, fetch more
    if (queue.length - nextIdx < 20 && (page || pageToken)) {
        fetchLeads(viewId, page, pageToken);
    }
  };

  return {
    currentLead: queue[currentIndex],
    loading,
    nextLead,
    isQueueFinished: !loading && !queue[currentIndex]
  };
}
