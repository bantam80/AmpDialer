export default async function handler(req, res) {
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Access-Control-Allow-Origin', '*');

  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    const { username, password } = req.body;
    const { NS_HOST, NS_CLIENT_SECRET } = process.env;

    const authUrl = `https://${NS_HOST}/pbx/v1/oauth2/token/`;

    const response = await fetch(authUrl, {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'User-Agent': 'Vercel-AmpDialer-Native'
      },
      body: JSON.stringify({
        grant_type: 'password',
        client_id: '0-t41691-c291565-r291528',
        client_secret: NS_CLIENT_SECRET,
        username: username,
        password: password
      })
    });

    // Capture the raw text first to avoid the "Unexpected end of JSON" crash
    const responseText = await response.text();
    
    if (!responseText) {
      return res.status(response.status).json({ 
        success: false, 
        error: `Empty response from ${NS_HOST}. Status: ${response.status}` 
      });
    }

    const data = JSON.parse(responseText);
    return res.status(response.status).json(data);

  } catch (err) {
    console.error("Native Login Error:", err.message);
    return res.status(500).json({ success: false, error: err.message });
  }
}
