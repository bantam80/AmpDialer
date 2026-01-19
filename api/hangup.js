export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ ok: false, code: 405, message: "Method Not Allowed" });

  try {
    const authHeader = req.headers.authorization;
    const { uid, callid } = req.body || {};

    if (!authHeader || !uid || !callid) {
      return res.status(400).json({
        ok: false,
        code: 400,
        message: "Missing required fields",
        missing: { authorization: !authHeader, uid: !uid, callid: !callid }
      });
    }

    const params = new URLSearchParams();
    params.append("uid", uid);
    params.append("callid", callid);

    // NetSapiens/Ringlogix: object=call, action=disconnect :contentReference[oaicite:2]{index=2}
    const upstream = await fetch(
      "https://api.ringlogix.com/pbx/v1/?object=call&action=disconnect&format=json",
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
        error: "Ringlogix disconnect failed",
        upstreamStatus: upstream.status,
        upstreamBody: upstreamJson ?? upstreamText,
        callid
      });
    }

    return res.status(200).json({
      ok: true,
      callid,
      upstreamStatus: upstream.status,
      upstreamBody: upstreamJson ?? upstreamText
    });
  } catch (e) {
    return res.status(500).json({ ok: false, code: 500, message: "Internal Server Error", error: e?.message || String(e) });
  }
}
