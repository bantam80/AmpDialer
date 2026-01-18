const axios = require('axios');

export default async function handler(req, res) {
  // Always return JSON to prevent the "Unexpected token A" error
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Access-Control-Allow-Origin', '*');

  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    const { username, password } = req.body;
    const { NS_HOST, NS_CLIENT_ID, NS_CLIENT_SECRET } = process.env;

    const authUrl = `https://${NS_HOST}/pbx/v1/oauth2/token/`;

    // Attempting the post with the parameters confirmed in your Postman test
    const response = await axios.post(authUrl, {
      grant_type: 'password',
      client_id: NS_CLIENT_ID,
      client_secret: NS_CLIENT_SECRET,
      username: username,
      password: password
    }, {
      headers: { 'Content-Type': 'application/json' }
    });

    return res.status(200).json(response.data);

  } catch (err) {
    // Log the actual error to Vercel logs for evaluation
    console.error("Token Acquisition Error:", err.response?.data || err.message);
    
    return res.status(err.response?.status || 500).json({
      success: false,
      error: err.response?.data?.message || err.message,
      detail: "Check Vercel environment variables for NS_CLIENT_ID and NS_CLIENT_SECRET"
    });
  }
}
