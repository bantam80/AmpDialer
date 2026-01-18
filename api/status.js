import axios from 'axios';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();

  const { token, domain, extension } = req.query;
  const clusterHost = process.env.NS_CLUSTER_HOST; 

  try {
    // Ensure the path ends with a trailing slash
    const statusUrl = `https://${clusterHost}/ns-api/v2/domains/${domain}/users/${extension}/devices/`;
    
    console.log(`Checking Status for ${extension}@${domain} on ${clusterHost}`);

    const response = await axios.get(statusUrl, {
      headers: { 
        'Authorization': `Bearer ${token}`,
        'Accept': 'application/json'
      }
    });

    const devices = response.data;
    // Look for the specific 'wp' suffix found in your SNAP.Go logs
    const wpDevice = devices.find(d => d.device === `${extension}wp`);

    return res.status(200).json({ 
      success: true, 
      wpStatus: wpDevice ? wpDevice.registration_status : "Not Found",
      allDevices: devices.map(d => d.device) // Helpful for debugging
    });

  } catch (err) {
    console.error("Status Check Error Detail:", err.response?.data || err.message);
    return res.status(err.response?.status || 400).json({ 
      success: false, 
      error: err.response?.data?.message || err.message 
    });
  }
}
