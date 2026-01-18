export default async function handler(req, res) {
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Access-Control-Allow-Origin', '*');

  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    const { toNumber, session } = req.body;
    const { NS_HOST } = process.env;

    const dialUrl = `https://${NS_HOST}/pbx/v1/?object=call&action=call&format=json`;

    // Format body as x-www-form-urlencoded for v1 API
    const bodyParams = new URLSearchParams({
      callid: `amp-${Date.now()}`,
      uid: `${session.user}@${session.domain}`,
      destination: `sip:${toNumber}@${session.domain}`
    });

    const response = await fetch(dialUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${session.access_token}`,
        'Content-Type': 'application/x-www-form-urlencoded',
        'Accept': 'application/json'
      },
      body: bodyParams.toString()
    });

    const data = await response.json();
    return res.status(response.status).json(data);

  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
}
