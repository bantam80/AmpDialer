import axios from 'axios';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();

  const { NS_HOST, NS_CLIENT_ID, NS_CLIENT_SECRET } = process.env;
  const { user, pass } = req.body;

  try {
    // 1. Create the Basic Auth header (ClientID:ClientSecret encoded to Base64)
    const authHeader = Buffer.from(`${NS_CLIENT_ID}:${NS_CLIENT_SECRET}`).toString('base64');

    // 2. Setup the body params
    const params = new URLSearchParams();
    params.append('grant_type', 'password');
    params.append('username', user);
    params.append('password', pass);

    const response = await axios.post(
      `https://${NS_HOST}/oauth/token`,
      params.toString(),
      {
        headers: { 
          'Content-Type': 'application/x-www-form-urlencoded',
          'Authorization': `Basic ${authHeader}`
        }
      }
    );

    // 3. Parse the extension and domain for later use in Dialing
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
    // 4. Log the EXACT error from NetSapiens to your Vercel Dashboard
    console.error("NetSapiens Response Error:", err.response?.data || err.message);
    
    return res.status(401).json({ 
      success: false, 
      error: err.response?.data?.error_description || err.response?.data?.error || "Unauthorized" 
    });
  }
}
