import axios from 'axios';

export default async function handler(req, res) {
  // Handle CORS and Options
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const { user, pass } = req.body;

  // Safety check: ensure variables exist
  if (!process.env.NS_HOST || !process.env.NS_CLIENT_ID) {
    return res.status(500).json({ 
        success: false, 
        error: "Missing Vercel Environment Variables: NS_HOST or NS_CLIENT_ID" 
    });
  }

  try {
    // Using URLSearchParams (native to Node.js) instead of querystring
    const params = new URLSearchParams();
    params.append('grant_type', 'password');
    params.append('client_id', process.env.NS_CLIENT_ID);
    params.append('client_secret', process.env.NS_CLIENT_SECRET);
    params.append('username', user);
    params.append('password', pass);

    const response = await axios.post(
      `https://${process.env.NS_HOST}/oauth/token`,
      params,
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
    console.error("NetSapiens Auth Error:", err.response?.data || err.message);
    
    return res.status(401).json({ 
      success: false, 
      error: err.response?.data?.error_description || "Authentication failed" 
    });
  }
}
