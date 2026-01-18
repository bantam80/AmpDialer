import axios from 'axios';

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') return res.status(200).end();
  const { user, pass } = req.body;

  try {
    const response = await axios.post(`https://${process.env.NS_HOST}/oauth/token`, {
      grant_type: 'password',
      client_id: process.env.NS_CLIENT_ID,
      client_secret: process.env.NS_CLIENT_SECRET,
      username: user,
      password: pass
    });

    const [extension, domain] = user.split('@');
    res.status(200).json({
      success: true,
      session: {
        token: response.data.access_token,
        extension,
        domain
      }
    });
  } catch (err) {
    res.status(401).json({ success: false, error: "Authentication failed" });
  }
}
