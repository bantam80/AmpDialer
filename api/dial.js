import { randomUUID } from "crypto";

export default async function handler(req, res) {
  // CORS (OK for dev; lock down for prod)
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ code: 405, message: "Method Not Allowed" });

  try {
    const { uid, destination, domain } = req.body || {};
    const authHeader = req.headers.authorization;

    if (!uid || !destination || !domain || !authHeader) {
      return res.status(400).json({
        ok: false,
        code: 400,
        message: "Missing required fields",
        missing: {
          uid: !uid,
          destination: !destination,
          domain: !domain,
          authorization: !authHeader
        }
      });
    }

    // Ringlogix Format: sip:1<digits>@<domain>
    // NOTE: we are leaving the `1` prefix exactly as you had it for now.
    // After we capture upstream responses, we can standardize phone normalization.
    const sipDestination = `sip:1${destination}@${domain}`;
    const callid = `${randomUUID()}@ampdialer`;

    const params = new URLSearchParams();
    params.append("callid", callid);
    params.append("uid", uid);
    params.append("destination", sipDestination);

    const upstream = await fetch(
      "https://api.ringlogix.com/pbx/v1/?object=call&action=call&format=json",
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

    // Read body safely (Ringlogix might return JSON OR plain text)
    const upstreamText = await upstream.text();

    let upstreamJson = null;
    try {
      upstreamJson = JSON.parse(upstreamText);
    } catch (_) {
      // Not JSON; keep raw text
    }

    // Always return a structured response to the frontend
    if (!upstream.ok) {
      return res.status(upstream.status).json({
        ok: false,
        error: "Ringlogix dial failed",
        callid,
        destination: sipDestination,
        upstreamStatus: upstream.status,
        upstreamBody: upstreamJson ?? upstreamText
      });
    }

    // Success: return details so you can capture exact upstream behavior
    return res.status(200).json({
      ok: true,
      callid,
      destination: sipDestination,
      upstreamStatus: upstream.status,
      upstreamBody: upstreamJson ?? upstreamText
    });
  } catch (e) {
    return res.status(500).json({
      ok: false,
      code: 500,
      message: "Internal Server Error",
      // helpful, but not overly revealing
      error: e?.message || String(e)
    });
  }
}
