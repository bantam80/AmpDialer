export default async function handler(req, res) {
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Access-Control-Allow-Origin', '*');

  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    const { session } = req.body;
    // v1 API using Query Params for direct user/domain lookup
    const statusUrl = `https://api.ringlogix.com/pbx/v1/?object=device&action=read&format=json&domain=${session.domain}&user=${session.user}`;

    const response = await fetch(statusUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${session.access_token}`,
        'Accept': 'application/json'
      }
    });

    const rawData = await response.json();

    // Helper: Ensure we are working with an array (matches your Postman asArray)
    const rows = Array.isArray(rawData) ? rawData : (rawData.data || Object.values(rawData) || []);

    // Heuristics: determine if a device is registered (matches your Postman isActive)
    const activeEndpoints = rows.filter(r => {
      const mode = (r.mode || "").toLowerCase();
      const isRegistered = r.registered === 'yes' || 
                           mode.includes("registered") || 
                           mode === "active" || 
                           mode === "ok";
      return isRegistered;
    }).map(r => ({
      endpoint: r.aor || r.device || r.uid,
      userAgent: r.user_agent || "",
      isWebphone: (r.user_agent || "").includes("Webphone"),
      status: r.mode
    }));

    return res.status(200).json({
      success: true,
      count: activeEndpoints.length,
      registered: activeEndpoints.length > 0,
      webphoneActive: activeEndpoints.some(e => e.isWebphone),
      activeEndpoints
    });

  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
}
