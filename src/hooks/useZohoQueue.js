import { useEffect, useMemo, useState } from 'react';

/**
 * Zoho Queue Hook
 * - Uses CVID (custom view id) to fetch Leads from the active list view
 * - Defaults to current Zoho list view via PageLoad.cvid (passed in as initialCvid)
 * - Provides dropdown support by returning `views` + `setActiveView`
 * - Lazy loads additional pages (not capped)
 */
export function useZohoQueue({ zohoReady, initialCvid } = {}) {
  const [views, setViews] = useState([]);
  const [selectedViewId, setSelectedViewId] = useState(null);

  const [queue, setQueue] = useState([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [loading, setLoading] = useState(true);

  // Pagination
  const [page, setPage] = useState(1);
  const [pageToken, setPageToken] = useState(null); // if SDK returns token
  const [hasMore, setHasMore] = useState(true);

  const currentLead = useMemo(() => queue[currentIndex], [queue, currentIndex]);
  const queueRemaining = Math.max(0, queue.length - currentIndex);

  function resetQueue() {
    setQueue([]);
    setCurrentIndex(0);
    setPage(1);
    setPageToken(null);
    setHasMore(true);
  }

  function normalizeLeadRecord(r) {
    const first = r.First_Name || '';
    const last = r.Last_Name || '';
    const name = `${first} ${last}`.trim() || r.Full_Name || 'Unknown';
    const phoneDigits = (r.Phone || '').replace(/\D/g, '');

    return {
      id: r.id,
      Name: name,
      Phone: phoneDigits,
      Company: r.Company,
      Status: r.Lead_Status
    };
  }

  // ---- Compat helpers (different SDK builds expose different methods) ----
  function getCrmApi() {
    const api = window?.ZOHO?.CRM?.API;
    if (!api) throw new Error('ZOHO.CRM.API not available');
    return api;
  }

  async function crmListRecords(params) {
    const api = getCrmApi();

    // Prefer getAllRecords (common in embedded/widget SDK)
    if (typeof api.getAllRecords === 'function') {
      return await api.getAllRecords(params);
    }

    // Fallback if getRecords exists in your build
    if (typeof api.getRecords === 'function') {
      return await api.getRecords(params);
    }

    // If neither exists, print methods to help debugging
    console.error('Available ZOHO.CRM.API methods:', Object.keys(api));
    throw new Error('No supported list-record method found on ZOHO.CRM.API');
  }

  async function fetchViews() {
    const meta = window?.ZOHO?.CRM?.META;
    if (!meta?.getCustomViews) throw new Error('ZOHO.CRM.META.getCustomViews not available');

    // Your SDK expects Entity (not module)
    const resp = await meta.getCustomViews({ Entity: 'Leads' });

    // Be resilient to shape differences
    const list = resp?.data || resp?.custom_views || resp || [];
    if (!Array.isArray(list)) throw new Error('Unexpected getCustomViews response shape');

    setViews(list);
    return list;
  }

  async function fetchLeads({ cvid, pageNum, token }) {
    if (!cvid || !hasMore) return;

    setLoading(true);

    const perPage = 200;

    // getAllRecords usually expects Entity + page/per_page (+ cvid is commonly supported)
    const params = {
      Entity: 'Leads',
      per_page: perPage,
      cvid: String(cvid)
    };

    if (token) params.page_token = token;
    else params.page = pageNum;

    try {
      const resp = await crmListRecords(params);

      // Normalize response shapes:
      // - some builds return {data, info}
      // - some builds return an array directly (older behavior)
      const data = Array.isArray(resp) ? resp : (resp?.data || []);
      const info = Array.isArray(resp) ? null : (resp?.info || null);

      const validLeads = data
        .map(normalizeLeadRecord)
        .filter((l) => l.Phone && l.Phone.length >= 10);

      setQueue((prev) => [...prev, ...validLeads]);

      // Pagination decisions:
      // If info exists, trust it. Otherwise infer from record count.
      let more = false;
      let nextToken = null;

      if (info) {
        more = !!info.more_records;
        nextToken = info.next_page_token || null;
      } else {
        // Infer: if we got a full page, assume there may be more
        more = data.length === perPage;
      }

      if (!more) {
        setHasMore(false);
        return;
      }

      if (nextToken) {
        setPageToken(nextToken);
      } else {
        setPage(pageNum + 1);
      }
    } catch (e) {
      console.error('Fetch Error', e);
      setHasMore(false);
    } finally {
      setLoading(false);
    }
  }

  async function setActiveView(cvid) {
    if (!cvid) return;

    const id = String(cvid);
    localStorage.setItem('amp_selected_cvid', id);

    setSelectedViewId(id);
    resetQueue();

    await fetchLeads({ cvid: id, pageNum: 1, token: null });
  }

  // INIT: wait for Zoho init to complete before calling CRM APIs
  useEffect(() => {
    if (!zohoReady) return;

    const hasZohoCRM = !!(window?.ZOHO?.CRM?.API && window?.ZOHO?.CRM?.META);
    if (!hasZohoCRM) {
      console.warn('Zoho CRM SDK not available. Cannot load queue.');
      setLoading(false);
      return;
    }

    (async () => {
      try {
        const viewList = await fetchViews();

        const saved = localStorage.getItem('amp_selected_cvid');
        const candidate = initialCvid || saved || (viewList[0] ? String(viewList[0].id) : null);

        if (candidate) {
          await setActiveView(candidate);
        } else {
          setLoading(false);
        }
      } catch (e) {
        console.error('Zoho init queue error:', e);
        setLoading(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [zohoReady, initialCvid]);

  // Advance lead + prefetch when buffer low
  const nextLead = async () => {
    const nextIdx = currentIndex + 1;
    setCurrentIndex(nextIdx);

    const remaining = queue.length - nextIdx;
    if (remaining < 20 && hasMore && selectedViewId) {
      await fetchLeads({
        cvid: selectedViewId,
        pageNum: page || 1,
        token: pageToken
      });
    }
  };

  const isQueueFinished = !loading && !currentLead && !hasMore;

  return {
    views,
    selectedViewId,
    setActiveView,

    currentLead,
    loading,
    nextLead,
    queueRemaining,
    isQueueFinished
  };
}
