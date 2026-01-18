const axios = require('axios');

export default async function handler(req, res) {
  // 1. Force JSON headers to prevent the HTML crash page
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Access-Control-Allow-Origin', '*');

  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    const { username, password } = req.body;
    // CRITICAL: Token acquisition MUST use the central gateway
    const host = process.env.NS_HOST || 'api.ringlogix.com';
    const authUrl = `https://${host}/pbx/v1/oauth2/token/`;

    // 2. Format body as x-www-form-urlencoded
    const params = new URLSearchParams();
    params.append('grant_type', 'password');
    params.append('client_id', '0-t41691-c291565-r291528'); // Confirmed from your Postman Result
    params.append('client_secret', process.env.NS_CLIENT_SECRET);
    params.append('username', username);
    params.append('password', password);

    const response = await axios.post(authUrl, params.toString(), {
      headers: { 
        'Content-Type': 'application/x-www-form-urlencoded',
        'Accept': 'application/json'
      }
    });

    // 3. Success returns valid JSON to test.html
    return res.status(200).json(response.data);

  } catch (err) {
    // 4. Return JSON error instead of HTML to stop the "Unexpected token 'A'" crash
    console.error("Token Acquisition Failed:", err.response?.data || err.message);
    return res.status(err.response?.status || 500).json({
      success: false,
      error: err.response?.data?.error_description || err.message
    });
  }
}
