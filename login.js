export default async function handler(req, res) {
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Access-Control-Allow-Origin', '*');

  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    const { username, password } = req.body;
    const { NS_CLIENT_SECRET } = process.env;

    // Use Central Gateway for Token Acquisition
    const authUrl = `https://api.ringlogix.com/pbx/v1/oauth2/token/`;

    const bodyParams = new URLSearchParams({
      grant_type: 'password',
      client_id: '0-t41691-c291565-r291528',
      client_secret: NS_CLIENT_SECRET.trim(),
      username: username.trim(),
      password: password.trim()
    });

    const response = await fetch(authUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: bodyParams.toString()
    });

    const data = await response.json();
    
    if (!response.ok) {
      return res.status(response.status).json({ success: false, ...data });
    }

    return res.status(200).json(data);

  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
}
