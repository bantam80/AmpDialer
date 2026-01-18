export default async function handler(req, res) {
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Access-Control-Allow-Origin', '*');

  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    const { toNumber, session } = req.body;
    
    // v1 Action Path verified in Postman
    const dialUrl = `https://api.ringlogix.com/pbx/v1/?object=call&action=call&format=json`;

    const bodyParams = new URLSearchParams({
      callid: `amp-${Date.now()}`,
      uid: session.uid, // 101@291565
      destination: `sip:${toNumber}@${session.domain}` // sip:1770...
    });

    const response = await fetch(dialUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${session.access_token}`,
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: bodyParams.toString()
    });

    const data = await response.json();
    return res.status(response.status).json(data);

  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
}
