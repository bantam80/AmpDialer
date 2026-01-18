export default async function handler(req, res) {
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Access-Control-Allow-Origin', '*');

  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    const { session } = req.body;
    // Use the central gateway for status lookups to match the login authority
    const statusUrl = `https://api.ringlogix.com/pbx/v1/?object=device&action=read&format=json`;

    const response = await fetch(statusUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${session.access_token}`,
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      // Using URLSearchParams to match the v1 POST methodology verified in Postman
      body: new URLSearchParams({
        domain: session.domain,
        user: session.user
      }).toString()
    });

    const data = await response.json();
    
    // Evaluate registration status: logic to check if at least one device is 'yes'
    const isRegistered = data.some(device => device.registered === 'yes');

    return res.status(200).json({
      success: true,
      registered: isRegistered,
      devices: data.map(d => ({ name: d.device, status: d.registered }))
    });

  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
}
