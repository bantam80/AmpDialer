import axios from 'axios';

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') return res.status(200).end();
  
  const { toNumber, agentExt, agentDomain } = req.body;

  try {
    const nsResponse = await axios.post(
      `https://${process.env.NS_HOST}/apiv2/domains/${agentDomain}/users/${agentExt}/calls`,
      { destination: toNumber },
      {
        headers: { 'Authorization': `Bearer ${process.env.NS_API_KEY}` }
      }
    );
    res.status(200).json({ success: true, data: nsResponse.data });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}
