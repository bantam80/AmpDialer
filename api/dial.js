import axios from 'axios';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const { toNumber, session } = req.body;
  const clusterHost = process.env.NS_CLUSTER_HOST;

  try {
    const dialUrl = `https://${clusterHost}/ns-api/v2/domains/${session.domain}/users/${session.extension}/calls/`;
    
    const response = await axios.post(
      dialUrl,
      { 
        destination: toNumber,
        device: `${session.extension}wp` // Targets 101wp
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
    console.error("Dial Error Detail:", err.response?.data || err.message);
    return res.status(err.response?.status || 400).json({ 
      success: false, 
      error: err.response?.data?.message || err.message 
    });
  }
}
