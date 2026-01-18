const axios = require('axios');

export default async function handler(req, res) {
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Access-Control-Allow-Origin', '*');

  if (req.method === 'OPTIONS') return res.status(200).end();

  const { username, password } = req.body;
  // Use NS_HOST specifically for token acquisition
  const host = process.env.NS_HOST || 'api.ringlogix.com';

  try {
    const authUrl = `https://${host}/pbx/v1/oauth2/token/`;
    
    // Body MUST be URL encoded for this specific v1 endpoint
    const params = new URLSearchParams();
    params.append('grant_type', 'password');
    params.append('client_id', '0-t41691-c291565-r291528');
    params.append('client_secret', process.env.NS_CLIENT_SECRET); 
    params.append('username', username);
    params.append('password', password);

    const response = await axios.post(authUrl, params.toString(), {
      headers: { 
        'Content-Type': 'application/x-www-form-urlencoded',
        'Accept': 'application/json'
      }
    });

    // Return the full object so test.html can save the token, domain, and territory
    return res.status(200).json(response.data);

  } catch (err) {
    // Log the detailed error to Vercel so we can evaluate the failure
    console.error("Token Acquisition Failed:", err.response?.data || err.message);
    
    return res.status(err.response?.status || 500).json({
      success: false,
      error: err.response?.data?.error_description || err.message,
      debug_host: host
    });
  }
}
