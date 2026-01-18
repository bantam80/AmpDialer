import axios from 'axios';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();

  const { toNumber, session } = req.body;
  const { NS_HOST } = process.env;

  try {
    // Attempting the standard v2 path which is typically used for call control
    const dialUrl = `https://${NS_HOST}/apiv2/domains/${session.domain}/users/${session.extension}/calls`;
    
    console.log(`Attempting Dial to: ${toNumber} via ${dialUrl} for device 101WP`);

    const response = await axios.post(
      dialUrl,
      { 
        destination: toNumber,
        device: "101WP" // Explicitly targeting your device ID
      },
      {
        headers: { 
          'Authorization': `Bearer ${session.token}`,
          'Content-Type': 'application/json'
        }
      }
    );

    return res.status(200).json({ 
        success: true, 
        data: response.data 
    });

  } catch (err) {
    // Log the error detail to see if it's still a 404 or something else (like device offline)
    console.error("Dial Error Detail:", err.response?.data || err.message);
    
    return res.status(err.response?.status || 500).json({ 
      success: false, 
      error: err.response?.data?.message || err.message 
    });
  }
}
