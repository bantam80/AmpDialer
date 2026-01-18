export default async function handler(req, res) {
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Access-Control-Allow-Origin', '*');

  try {
    const { username, password } = req.body;
    const authUrl = `https://${process.env.NS_HOST}/pbx/v1/oauth2/token/`;

    const response = await fetch(authUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        grant_type: 'password',
        client_id: '0-t41691-c291565-r291528',
        client_secret: process.env.NS_CLIENT_SECRET,
        username: username,
        password: password
      })
    });

    const data = await response.json();
    return res.status(response.status).json(data);

  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
