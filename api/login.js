export default async function handler(req, res) {
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Access-Control-Allow-Origin', '*');

  if (req.method === 'OPTIONS') return res.status(200).end();

  const { username, password } = req.body;
  const host = (process.env.NS_HOST || 'api.ringlogix.com').trim();
  const secret = (process.env.NS_CLIENT_SECRET || '').trim();
  const client_id = '0-t41691-c291565-r291528'; 

  console.log(`[DEBUG] Attempting Login to: https://${host}/pbx/v1/oauth2/token/`);
  console.log(`[DEBUG] Payload IDs: ClientID=${client_id}, SecretPresent=${!!secret}`);

  try {
    const bodyParams = new URLSearchParams();
    bodyParams.append('grant_type', 'password');
    bodyParams.append('client_id', client_id);
    bodyParams.append('client_secret', secret);
    bodyParams.append('username', username?.trim());
    bodyParams.append('password', password?.trim());

    const response = await fetch(`https://${host}/pbx/v1/oauth2/token/`, {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/x-www-form-urlencoded',
        'Accept': 'application/json'
      },
      body: bodyParams.toString()
    });

    const responseText = await response.text();
    console.log(`[DEBUG] Gateway Status: ${response.status}`);
    console.log(`[DEBUG] Gateway Raw Response: ${responseText}`);

    if (!response.ok) {
      return res.status(response.status).json({ 
        success: false, 
        error: "Login Step Failed",
        gateway_status: response.status,
        gateway_response: responseText,
        debug_info: { host, client_id, secret_length: secret.length }
      });
    }

    const data = JSON.parse(responseText);
    return res.status(200).json(data);

  } catch (err) {
    console.error("[CRITICAL] Login Script Crash:", err.message);
    return res.status(500).json({ success: false, error: err.message });
  }
}
