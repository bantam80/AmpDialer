import axios from 'axios';

export default async function handler(req, res) {
  const { agentExt, agentDomain } = req.query;

  try {
    const response = await axios.get(
      `https://${process.env.NS_HOST}/apiv2/domains/${agentDomain}/users/${agentExt}/calls`,
      {
        headers: { 'Authorization': `Bearer ${process.env.NS_API_KEY}` }
      }
    );
    // Returns list of active calls for this agent
    res.status(200).json(response.data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}
