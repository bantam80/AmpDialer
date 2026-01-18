import axios from 'axios';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();

  const { toNumber, session } = req.body;
  const { NS_HOST } = process.env;

  try {
    // Standard Call Control path for NS API v2
    const dialUrl = `https://${NS_HOST}/ns-api/v2/domains/${session.domain}/users/${session.extension}/calls/`;
    
    console.log(`Dialing ${toNumber} via ${dialUrl}`);

    const response = await axios.post(
      dialUrl,
      { 
        destination: toNumber,
        device: `${session.extension}wp` // Dynamic: 101wp
      },
      {
        headers: { 
          'Authorization': `Bearer ${session.token}`,
          'Content-Type': 'application/json'
        }
      }
    );

    return res.status(200).json({ success: true, data: response.data });

  } catch (err) {
    // If /ns-api/v2/ fails, let's log the error and consider /apiv2/ as a secondary fallback
    console.error("Dial Error Detail:", err.response?.data || err.message);
    
    return res.status(err.response?.status || 500).json({ 
      success: false, 
      error: `Status ${err.response?.status}: ${err.response?.data?.message || err.message}`
    });
  }
}
