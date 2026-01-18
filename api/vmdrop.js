import axios from 'axios';

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') return res.status(200).end();
  
  const { callId, agentExt, agentDomain } = req.body;

  try {
    // PATCH to transfer the existing call to the VM Drop Feature Code (e.g. *88)
    const response = await axios.patch(
      `https://${process.env.NS_HOST}/apiv2/domains/${agentDomain}/users/${agentExt}/calls/${callId}`,
      { destination: '*88' }, // This routes to your To-Web responder
      {
        headers: { 'Authorization': `Bearer ${process.env.NS_API_KEY}` }
      }
    );
    res.status(200).json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}
