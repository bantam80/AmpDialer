// FILE: src/hooks/useZohoQueue.js
import { useEffect, useMemo, useState } from "react";

export function useZohoQueue({ zohoReady, initialCvid } = {}) {
  const [views, setViews] = useState([]);
  const [selectedViewId, setSelectedViewId] = useState(null);

  const [queue, setQueue] = useState([]);
  const [currentIndex, setCurrentIndex] = useState(0);

  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [pageToken, setPageToken] = useState(null);
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

  // Default lead fields we require in the queue (includes Email)
  // You can override this in the browser console via:
  // localStorage.setItem("amp_lead_fields", "id,First_Name,Last_Name,Full_Name,Phone,Company,Lead_Status,Email");
  function getLeadFieldsCsv() {
    const override = (localStorage.getItem("amp_lead_fields") || "").trim();
    if (override) return override;

    // Standard Zoho API names (common/default). If your org differs, use the override above.
    return "id,First_Name,Last_Name,Full_Name,Phone,Company,Lead_Status,Email";
  }

  function normalizeLeadRecord(r) {
    const first = r?.First_Name || "";
    const last = r?.Last_Name || "";
    const name = `${first} ${last}`.trim() || r?.Full_Name || r?.Full_Name || "Unknown";
    const phoneDigits = (r?.Phone || "").replace(/\D/g, "");

    // Keep Email as returned (may be undefined if not requested / permission-limited)
    const email = r?.Email;

    return {
      id: r?.id,
      Name: name,
      Phone: phoneDigits,
      Company: r?.Company,
      Status: r?.Lead_Status,
      Email: email
    };
  }

  function getCrmApi() {
    const api = window?.ZOHO?.CRM?.API;
    if (!api) throw new Error("ZOHO.CRM.API not available");
    return api;
  }

  async function crmListRecords(params) {
    const api = getCrmApi();
    if (typeof api.getAllRecords === "function") return api.getAllRecords(params);
    if (typeof api.getRecords === "function") return api.getRecords(params);
    console.error("Available ZOHO.CRM.API methods:", Object.keys(api));
    throw new Error("No supported list-record method found (expected getAllRecords).");
  }

  async function fetchViews() {
    const meta = window?.ZOHO?.CRM?.META;
    if (!meta?.getCustomViews) throw new Error("ZOHO.CRM.META.getCustomViews not available");

    const resp = await meta.getCustomViews({ Entity: "Leads" });
    const list = resp?.data || resp?.custom_views || resp || [];
    if (!Array.isArray(list)) throw new Error("Unexpected getCustomViews response shape");

    setViews(list);
    return list;
  }

  async function fetchLeads({ cvid, pageNum, token }) {
    if (!cvid || !hasMore) return;

    setLoading(true);

    const perPage = 200;
    const fieldsCsv = getLeadFieldsCsv();

    const params = {
      Entity: "Leads",
      per_page: perPage,
      cvid: String(cvid),

      // CRITICAL FIX:
      // Force Zoho to return Email (and other required fields) in list fetches.
      // Zoho SDK accepts this param in most orgs.
      fields: fieldsCsv
    };

    if (token) params.page_token = token;
    else params.page = pageNum;

    try {
      const resp = await crmListRecords(params);

      const data = Array.isArray(resp) ? resp : resp?.data || [];
      const info = Array.isArray(resp) ? null : resp?.info || null;

      // Normalize and keep only callable records
      const validLeads = data
        .map(normalizeLeadRecord)
        .filter((l) => l?.Phone && String(l.Phone).length >= 10);

      setQueue((prev) => [...prev, ...validLeads]);

      let more = false;
      let nextToken = null;

      if (info) {
        more = !!info.more_records;
        nextToken = info.next_page_token || null;
      } else {
        more = data.length === perPage;
      }

      if (!more) {
        setHasMore(false);
        return;
      }

      if (nextToken) setPageToken(nextToken);
      else setPage(pageNum + 1);
    } catch (e) {
      console.error("Fetch Error", e);
      setHasMore(false);
    } finally {
      setLoading(false);
    }
  }

  async function setActiveView(cvid) {
    const id = String(cvid);
    localStorage.setItem("amp_selected_cvid", id);
    setSelectedViewId(id);

    resetQueue();
    await fetchLeads({ cvid: id, pageNum: 1, token: null });
  }

  useEffect(() => {
    if (!zohoReady) return;

    const hasZohoCRM = !!(window?.ZOHO?.CRM?.API && window?.ZOHO?.CRM?.META);
    if (!hasZohoCRM) {
      console.warn("Zoho CRM SDK not available. Cannot load queue.");
      setLoading(false);
      return;
    }

    (async () => {
      try {
        const viewList = await fetchViews();
        const saved = localStorage.getItem("amp_selected_cvid");
        const candidate = initialCvid || saved || (viewList[0] ? String(viewList[0].id) : null);

        if (candidate) await setActiveView(candidate);
        else setLoading(false);
      } catch (e) {
        console.error("Zoho init queue error:", e);
        setLoading(false);
      }
    })();
  }, [zohoReady, initialCvid]);

  const nextLead = async () => {
    const nextIdx = currentIndex + 1;
    setCurrentIndex(nextIdx);

    const remaining = queue.length - nextIdx;
    if (remaining < 20 && hasMore && selectedViewId) {
      await fetchLeads({ cvid: selectedViewId, pageNum: page || 1, token: pageToken });
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
