const axios = require('axios');

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const { toNumber, session } = req.body;
  const { NS_HOST } = process.env;

  try {
    // V1 API URL with query params
    const dialUrl = `https://${NS_HOST}/pbx/v1/?object=call&action=call&format=json`;
    
    // Formatting the number into the required SIP URI format
    const sipDestination = `sip:${toNumber}@${session.domain}`;

    // Body MUST be URL encoded
    const params = new URLSearchParams();
    params.append('callid', `amp-${Date.now()}`);
    params.append('uid', `${session.extension}@${session.domain}`);
    params.append('destination', sipDestination);

    const response = await axios.post(dialUrl, params.toString(), {
      headers: { 
        'Authorization': `Bearer ${session.token}`,
        'Content-Type': 'application/x-www-form-urlencoded',
        'Accept': 'application/json'
      }
    });

    return res.status(200).json({ success: true, data: response.data });

  } catch (err) {
    console.error("Dial Error:", err.response?.data || err.message);
    return res.status(err.response?.status || 500).json({ 
      success: false, 
      error: err.response?.data?.message || err.message 
    });
  }
}
