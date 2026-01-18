import axios from 'axios';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();

  const { toNumber, session } = req.body;
  const { NS_HOST } = process.env;

  try {
    // Standard NS v2 Call Control path
    const dialUrl = `https://${NS_HOST}/ns-api/v2/domains/${session.domain}/users/${session.extension}/calls/`;
    
    const response = await axios.post(
      dialUrl,
      { 
        destination: toNumber,
        device: `${session.extension}wp` // Logic: 101wp
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
    return res.status(err.response?.status || 500).json({ 
      success: false, 
      error: err.response?.data?.message || err.message 
    });
  }
}
