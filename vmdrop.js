export default async function handler(req, res) {
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Access-Control-Allow-Origin', '*');

  if (req.method === 'OPTIONS') return res.status(200).end();

  const { callId, session } = req.body;

  try {
    // Vercel Node 24.x uses native fetch for PATCH requests
    const response = await fetch(
      `https://api.ringlogix.com/apiv2/domains/${session.domain}/users/${session.user}/calls/${callId}`,
      {
        method: 'PATCH',
        headers: { 
          'Authorization': `Bearer ${session.access_token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ destination: '*88' }) 
      }
    );

    const data = await response.json();
    return res.status(response.status).json(data);
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
}
