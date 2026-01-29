export default async function handler(req, res) {
  // Set Anti-Caching Headers immediately
  res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
  res.setHeader("Pragma", "no-cache");
  res.setHeader("Expires", "0");

  const allow = process.env.ALLOWED_ORIGINS;
  const origin = req.headers.origin || "";

  if (!allow) {
    res.setHeader("Access-Control-Allow-Origin", "*");
  } else {
    const allowed = allow.split(",").map((s) => s.trim()).filter(Boolean);
    if (allowed.includes(origin)) res.setHeader("Access-Control-Allow-Origin", origin);
  }
  
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "GET") return res.status(405).json({ ok: false, message: "Method Not Allowed" });

  try {
    const authHeader = req.headers.authorization;
    // Using WHATWG URL pattern to avoid DeprecationWarnings
    const { searchParams } = new URL(req.url, `https://${req.headers.host}`);
    const uid = searchParams.get("uid");

    if (!authHeader || !uid) {
      return res.status(400).json({ 
        ok: false, 
        message: "Missing required fields", 
        missing: { authorization: !authHeader, uid: !uid } 
      });
    }

    const params = new URLSearchParams();
    params.append("uid", String(uid));

    const upstream = await fetch("https://api.ringlogix.com/pbx/v1/?object=call&action=read&format=json", {
      method: "POST",
      headers: {
        Authorization: authHeader,
        "Content-Type": "application/x-www-form-urlencoded",
        Accept: "application/json"
      },
      body: params
    });

    const upstreamText = await upstream.text();
    let upstreamJson = null;
    try {
      upstreamJson = JSON.parse(upstreamText);
    } catch {}

    if (!upstream.ok) {
      return res.status(upstream.status).json({
        ok: false,
        error: "Ringlogix activeCalls failed",
        uid,
        upstreamStatus: upstream.status,
        upstreamBody: upstreamJson ?? upstreamText
      });
    }

    return res.status(200).json({
      ok: true,
      uid,
      upstreamStatus: upstream.status,
      upstreamBody: upstreamJson ?? upstreamText
    });
  } catch (e) {
    return res.status(500).json({ 
      ok: false, 
      message: "Internal Server Error", 
      error: e?.message || String(e) 
    });
  }
}
