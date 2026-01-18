export default async function handler(req, res) {
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Access-Control-Allow-Origin', '*');

  try {
    const { session } = req.body;
    const { NS_HOST } = process.env;

    const statusUrl = `https://${NS_HOST}/pbx/v1/?object=device&action=read&format=json`;

    const response = await fetch(statusUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${session.access_token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        domain: session.domain,
        user: session.user
      })
    });

    const data = await response.json();
    return res.status(response.status).json(data);

  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
}
