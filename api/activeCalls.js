export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "GET") return res.status(405).json({ ok: false, code: 405, message: "Method Not Allowed" });

  try {
    const authHeader = req.headers.authorization;
    const uid = String(req.query?.uid || "");

    if (!authHeader || !uid) {
      return res.status(400).json({
        ok: false,
        code: 400,
        message: "Missing required fields",
        missing: { authorization: !authHeader, uid: !uid }
      });
    }

    const params = new URLSearchParams();
    params.append("uid", uid);

    // NetSapiens: Read Active Calls is action=read :contentReference[oaicite:3]{index=3}
    const upstream = await fetch(
      "https://api.ringlogix.com/pbx/v1/?object=call&action=read&format=json",
      {
        method: "POST",
        headers: {
          Authorization: authHeader,
          "Content-Type": "application/x-www-form-urlencoded",
          Accept: "application/json"
        },
        body: params
      }
    );

    const upstreamText = await upstream.text();
    let upstreamJson = null;
    try { upstreamJson = JSON.parse(upstreamText); } catch {}

    if (!upstream.ok) {
      return res.status(upstream.status).json({
        ok: false,
        error: "Ringlogix read active calls failed",
        upstreamStatus: upstream.status,
        upstreamBody: upstreamJson ?? upstreamText
      });
    }

    return res.status(200).json({
      ok: true,
      upstreamStatus: upstream.status,
      upstreamBody: upstreamJson ?? upstreamText
    });
  } catch (e) {
    return res.status(500).json({ ok: false, code: 500, message: "Internal Server Error", error: e?.message || String(e) });
  }
}
