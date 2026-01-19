export default async function handler(req, res) {
  // CORS setup
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });

  const { username, password } = req.body;
  
  // Vercel Env Vars
  const { NS_CLIENT_ID, NS_CLIENT_SECRET } = process.env;

  try {
    const response = await fetch('https://api.ringlogix.com/pbx/v1/oauth2/token/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        grant_type: 'password',
        client_id: NS_CLIENT_ID,
        client_secret: NS_CLIENT_SECRET,
        username,
        password
      })
    });

    const data = await response.json();
    
    if (!response.ok) {
      return res.status(401).json({ message: 'Login failed', details: data });
    }

    // Return the token and user data to the frontend
    return res.status(200).json(data);
  } catch (error) {
    return res.status(500).json({ message: 'Server error', error: error.message });
  }
}
