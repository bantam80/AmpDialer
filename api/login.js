export default async function handler(req, res) {
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Access-Control-Allow-Origin', '*');

  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    const { username, password } = req.body;
    const { NS_HOST, NS_CLIENT_SECRET } = process.env;

    const authUrl = `https://${NS_HOST}/pbx/v1/oauth2/token/`;

    // Switch to URLSearchParams to ensure 'application/x-www-form-urlencoded' format
    const bodyParams = new URLSearchParams();
    bodyParams.append('grant_type', 'password');
    bodyParams.append('client_id', '0-t41691-c291565-r291528');
    bodyParams.append('client_secret', NS_CLIENT_SECRET);
    bodyParams.append('username', username);
    bodyParams.append('password', password);

    const response = await fetch(authUrl, {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/x-www-form-urlencoded',
        'Accept': 'application/json'
      },
      body: bodyParams.toString()
    });

    const responseText = await response.text();
    
    // If the gateway still returns a 400, this will show us exactly why (e.g., "invalid_grant")
    if (!response.ok) {
      return res.status(response.status).json({ 
        success: false, 
        error: responseText || "Gateway rejected the request format",
        status: response.status 
      });
    }

    const data = JSON.parse(responseText);
    return res.status(200).json(data);

  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
}
