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
    params.append('client_id', NS_CLIENT_ID); // Added back to body as some NS versions prefer it in both places
    params.append('client_secret', NS_CLIENT_SECRET);

    // UPDATED PATH: The specific RingLogix PBX V1 path with trailing slash
    const tokenUrl = `https://${NS_HOST}/pbx/v1/oauth2/token/`;
    
    console.log(`Attempting login at: ${tokenUrl}`);

    const response = await axios.post(
      tokenUrl,
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
    console.error("NetSapiens Error Detail:", err.response?.data || err.message);
    
    return res.status(err.response?.status || 500).json({ 
      success: false, 
      error: `Status ${err.response?.status}: ${err.response?.data?.message || err.message}`
    });
  }
}
