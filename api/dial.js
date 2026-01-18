import axios from 'axios';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();

  const { toNumber, session } = req.body;
  const { NS_HOST } = process.env;

  try {
    // Aligned with the working /pbx/v1/ path from your login success
    const dialUrl = `https://${NS_HOST}/pbx/v1/domains/${session.domain}/users/${session.extension}/calls`;
    
    console.log(`Attempting Dial to: ${toNumber} via ${dialUrl} for device 101WP`);

    const response = await axios.post(
      dialUrl,
      { 
        destination: toNumber,
        device: "101WP" // Explicitly targeting your specific device ID
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
    console.error("Dial Error Detail:", err.response?.data || err.message);
    
    return res.status(err.response?.status || 500).json({ 
      success: false, 
      error: err.response?.data?.message || err.message 
    });
  }
}
