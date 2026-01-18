// Use require to avoid ESM/CommonJS casing issues on Vercel
const axios = require('axios');

export default async function handler(req, res) {
  // 1. Force JSON headers immediately
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Access-Control-Allow-Origin', '*');

  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    const { username, password } = req.body;
    
    // 2. Validate Env Variables locally so we don't hit a blind crash
    if (!process.env.NS_HOST || !process.env.NS_CLIENT_SECRET) {
      throw new Error("Missing NS_HOST or NS_CLIENT_SECRET in Vercel settings.");
    }

    const authUrl = `https://${process.env.NS_HOST}/pbx/v1/oauth2/token/`;

    // 3. Match your verified Postman body exactly
    const response = await axios.post(authUrl, {
      grant_type: 'password',
      client_id: '0-t41691-c291565-r291528',
      client_secret: process.env.NS_CLIENT_SECRET,
      username: username,
      password: password
    }, {
      headers: { 'Content-Type': 'application/json' }
    });

    // 4. Always return the data as JSON
    return res.status(200).json(response.data);

  } catch (err) {
    // 5. Catch-all: This ensures the browser sees a JSON error, not 'A server error...'
    console.error("Login Error:", err.message);
    return res.status(err.response?.status || 500).json({
      success: false,
      error: err.response?.data?.message || err.message,
      detail: "Check Vercel Dashboard logs for 'Login Error' to see the trace."
    });
  }
}
