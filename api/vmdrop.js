import axios from 'axios';

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') return res.status(200).end();
  const { callId, session } = req.body;

  try {
    // Transfers the active call to the VM Drop feature code (*88)
    await axios.patch(
      `https://${process.env.NS_HOST}/apiv2/domains/${session.domain}/users/${session.extension}/calls/${callId}`,
      { destination: '*88' }, 
      { headers: { 'Authorization': `Bearer ${session.token}` } }
    );
    res.status(200).json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
}
