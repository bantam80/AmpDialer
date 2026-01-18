import axios from 'axios';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();

  const { token, domain, extension } = req.query;
  const { NS_HOST } = process.env;

  try {
    const statusUrl = `https://${NS_HOST}/ns-api/v2/domains/${domain}/users/${extension}/devices/`;
    
    const response = await axios.get(statusUrl, {
      headers: { 'Authorization': `Bearer ${token}` }
    });

    const devices = response.data;
    const wpDevice = devices.find(d => d.device === `${extension}wp`);

    return res.status(200).json({ 
      success: true, 
      devices: devices,
      wpStatus: wpDevice ? wpDevice.registration_status : "Not Found"
    });
  } catch (err) {
    return res.status(err.response?.status || 500).json({ success: false, error: err.message });
  }
}
