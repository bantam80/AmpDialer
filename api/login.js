import axios from 'axios';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();

  const { NS_HOST, NS_CLIENT_ID, NS_CLIENT_SECRET } = process.env;
  const { user, pass } = req.body;

  try {
    const authHeader = Buffer.from(`${NS_CLIENT_ID}:${NS_CLIENT_SECRET}`).toString('base64');

    const params = new URLSearchParams();
    params.append('grant_type', 'password');
    params.append('username', user);
    params.append('password', pass);

    // CHANGED PATH: Added /ns-api/oauth2/token which is standard for RingLogix v2
    const response = await axios.post(
      `https://${NS_HOST}/ns-api/oauth2/token`,
      params.toString(),
      {
        headers: { 
          'Content-Type': 'application/x-www-form-urlencoded',
          'Authorization': `Basic ${authHeader}`
        }
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
    // If the 404 persists, let's try one more common path fallback
    console.error("NetSapiens Response Error:", err.response?.data || err.message);
    
    return res.status(err.response?.status || 500).json({ 
      success: false, 
      error: `Path Error: ${err.message}. Check if NS_HOST is correct.`
    });
  }
}
