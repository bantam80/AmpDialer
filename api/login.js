// Use lowercase 'axios' to avoid case-sensitivity issues on Vercel
const axios = require('axios');

export default async function handler(req, res) {
  // Force JSON headers to stop the "Unexpected token A" browser crash
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Access-Control-Allow-Origin', '*');

  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    const { username, password } = req.body;
    
    // Evaluate if environment variables are present
    if (!process.env.NS_HOST || !process.env.NS_CLIENT_SECRET) {
      return res.status(500).json({ error: "Missing environment variables on Vercel." });
    }

    // Token acquisition MUST hit the central host (api.ringlogix.com)
    const authUrl = `https://${process.env.NS_HOST}/pbx/v1/oauth2/token/`;

    const response = await axios.post(authUrl, {
      grant_type: 'password',
      client_id: '0-t41691-c291565-r291528', // Validated client_id
      client_secret: process.env.NS_CLIENT_SECRET,
      username: username,
      password: password
    }, {
      headers: { 'Content-Type': 'application/json' }
    });

    return res.status(200).json(response.data);

  } catch (err) {
    // Return the actual error as JSON so test.html can display it
    console.error("Token Acquisition Error:", err.message);
    return res.status(err.response?.status || 500).json({
      success: false,
      error: err.response?.data?.message || err.message,
      hostUsed: process.env.NS_HOST
    });
  }
}
