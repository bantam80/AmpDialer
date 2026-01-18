import axios from 'axios';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const { token, domain, extension } = req.query;
  const clusterHost = process.env.NS_CLUSTER_HOST; // Using the cluster-specific host

  try {
    // Standard v2 path on your specific cluster
    const statusUrl = `https://${clusterHost}/ns-api/v2/domains/${domain}/users/${extension}/devices/`;
    
    const response = await axios.get(statusUrl, {
      headers: { 'Authorization': `Bearer ${token}` }
    });

    const wpDevice = response.data.find(d => d.device === `${extension}wp`);

    return res.status(200).json({ 
      success: true, 
      wpStatus: wpDevice ? wpDevice.registration_status : "Not Found"
    });
  } catch (err) {
    return res.status(err.response?.status || 500).json({ success: false, error: err.message });
  }
}
