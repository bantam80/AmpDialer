const axios = require('axios');

export default async function handler(req, res) {
  // 1. Force JSON headers to prevent HTML error responses
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  // 2. Handle CORS pre-flight
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  try {
    const { username, password } = req.body;
    const { NS_HOST } = process.env;

    // Use the central RingLogix gateway confirmed in your Postman test
    const authUrl = `https://${NS_HOST}/pbx/v1/oauth2/token/`;

    // 3. Match the EXACT Postman body format (x-www-form-urlencoded)
    const params = new URLSearchParams();
    params.append('grant_type', 'password');
    params.append('client_id', '0-t41691-c291565-r291528'); // Validated from your Postman Result
    params.append('client_secret', 'HIDDEN'); // Ensure this is set in your Vercel Env
    params.append('username', username);
    params.append('password', password);

    const response = await axios.post(authUrl, params.toString(), {
      headers: { 
        'Content-Type': 'application/x-www-form-urlencoded',
        'Accept': 'application/json'
      }
    });

    // 4. Return the successful token and session data
    return res.status(200).json(response.data);

  } catch (err) {
    // 5. Global Error Handler - Prevents the "A server error occurred" HTML crash
    console.error("Login Crash Detail:", err.response?.data || err.message);
    
    return res.status(err.response?.status || 500).json({
      success: false,
      error: err.response?.data?.error_description || err.message,
      message: "The server returned an error during the authentication attempt."
    });
  }
}
