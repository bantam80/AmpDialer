import axios from 'axios';

export default async function handler(req, res) {
  // 1. Set CORS headers manually to be safe
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // 2. Check for variables before doing anything
  const { NS_HOST, NS_CLIENT_ID, NS_CLIENT_SECRET } = process.env;
  if (!NS_HOST || !NS_CLIENT_ID || !NS_CLIENT_SECRET) {
    return res.status(500).json({ 
      success: false, 
      error: "Vercel Environment Variables are missing. Check NS_HOST, NS_CLIENT_ID, and NS_CLIENT_SECRET." 
    });
  }

  try {
    const { user, pass } = req.body;

    // 3. Construct the request using URLSearchParams
    const params = new URLSearchParams();
    params.append('grant_type', 'password');
    params.append('client_id', NS_CLIENT_ID);
    params.append('client_secret', NS_CLIENT_SECRET);
    params.append('username', user);
    params.append('password', pass);

    const response = await axios.post(
      `https://${NS_HOST}/oauth/token`,
      params.toString(),
      {
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
      }
    );

    const [extension, domain] = user.split('@');
    
    return res.status(200).json({
      success: true,
      session: {
        token: response.data.access_token,
        extension,
        domain
      }
    });

  } catch (err) {
    // This logs to the Vercel Dashboard Logs
    console.error("NetSapiens Error:", err.response?.data || err.message);
    
    return res.status(401).json({ 
      success: false, 
      error: err.response?.data?.error_description || "Authentication failed" 
    });
  }
}
