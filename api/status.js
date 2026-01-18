import axios from 'axios';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();

  const { token, domain, extension } = req.query;
  const { NS_HOST } = process.env;

  try {
    // Switching to the pbx/v1 gateway which we know works for your host
    const statusUrl = `https://${NS_HOST}/pbx/v1/domains/${domain}/users/${extension}/devices/`;
    
    console.log(`Checking device status at: ${statusUrl}`);

    const response = await axios.get(statusUrl, {
      headers: { 'Authorization': `Bearer ${token}` }
    });

    const devices = response.data;
    // NetSapiens typically returns an array or object of devices
    const deviceList = Array.isArray(devices) ? devices : (devices.data || []);
    const wpDevice = deviceList.find(d => d.device?.toLowerCase().includes('wp'));

    return res.status(200).json({ 
      success: true, 
      devices: deviceList,
      wpStatus: wpDevice ? wpDevice.registration_status : "Not Found"
    });

  } catch (err) {
    console.error("Status Error:", err.response?.data || err.message);
    return res.status(err.response?.status || 500).json({ 
      success: false, 
      error: `Status Check Failed: ${err.message}` 
    });
  }
}
