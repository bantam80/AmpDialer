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

  // Pagination support
  const [pageToken, setPageToken] = useState(null); // for >2000 mode
  const [page, setPage] = useState(1); // for <2000 mode
  const [hasMore, setHasMore] = useState(true);

  const currentLead = useMemo(() => queue[currentIndex], [queue, currentIndex]);
  const queueRemaining = Math.max(0, queue.length - currentIndex);

  function resetQueue() {
    setQueue([]);
    setCurrentIndex(0);
    setPageToken(null);
    setPage(1);
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

  async function fetchViews() {
    const resp = await window.ZOHO.CRM.META.getCustomViews({ Entity: 'Leads' });
    const list = resp?.data || [];
    setViews(list);
    return list;
  }

  async function fetchLeads({ cvid, pageNum, token }) {
    if (!cvid || !hasMore) return;

    setLoading(true);

    const params = {
      Entity: 'Leads',
      cvid,
      per_page: 200
    };

    if (token) params.page_token = token;
    else params.page = pageNum;

    try {
      const resp = await window.ZOHO.CRM.API.getRecords(params);

      const data = resp?.data || [];
      const info = resp?.info || {};

      const validLeads = data
        .map(normalizeLeadRecord)
        .filter((l) => l.Phone && l.Phone.length >= 10);

      setQueue((prev) => [...prev, ...validLeads]);

      // Determine if more records exist
      if (!info.more_records) {
        setHasMore(false);
        return;
      }

      // Token-based paging for huge result sets
      if (info.next_page_token) {
        setPageToken(info.next_page_token);
        setPage(null);
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

  // INIT: wait for Zoho init to complete before calling any CRM APIs
  useEffect(() => {
    if (!zohoReady) return;

    const hasZohoCRM =
      typeof window !== 'undefined' &&
      window.ZOHO &&
      window.ZOHO.CRM &&
      window.ZOHO.CRM.API &&
      window.ZOHO.CRM.META;

    if (!hasZohoCRM) {
      console.warn('Zoho CRM SDK not available. Cannot load queue.');
      setLoading(false);
      return;
    }

    (async () => {
      try {
        const viewList = await fetchViews();

        // Default priority:
        // 1) current Zoho list view (PageLoad.cvid)
        // 2) last saved
        // 3) first view from API
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

    // Prefetch more when near end
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
    // dropdown controls
    views,
    selectedViewId,
    setActiveView,

    // queue
    currentLead,
    loading,
    nextLead,
    queueRemaining,
    isQueueFinished
  };
}
