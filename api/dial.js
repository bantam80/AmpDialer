import axios from 'axios';

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') return res.status(200).end();
  const { toNumber, session } = req.body;

  try {
    const response = await axios.post(
      `https://${process.env.NS_HOST}/apiv2/domains/${session.domain}/users/${session.extension}/calls`,
      { destination: toNumber },
      { headers: { 'Authorization': `Bearer ${session.token}` } }
    );
    res.status(200).json({ success: true, data: response.data });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
}
