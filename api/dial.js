export default async function handler(req, res) {
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Access-Control-Allow-Origin', '*');

  const { toNumber, session } = req.body;
  const host = (process.env.NS_HOST || 'api.ringlogix.com').trim();

  console.log(`[DEBUG] Starting Dial: Target=${toNumber}, User=${session?.user}`);

  try {
    const dialUrl = `https://${host}/pbx/v1/?object=call&action=call&format=json`;
    
    const bodyParams = new URLSearchParams({
      callid: `amp-${Date.now()}`,
      uid: `${session.user}@${session.domain}`,
      destination: `sip:${toNumber}@${session.domain}`
    });

    console.log(`[DEBUG] Dial URL: ${dialUrl}`);
    console.log(`[DEBUG] Dial Body: ${bodyParams.toString()}`);

    const response = await fetch(dialUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${session.access_token}`,
        'Content-Type': 'application/x-www-form-urlencoded',
        'Accept': 'application/json'
      },
      body: bodyParams.toString()
    });

    const responseText = await response.text();
    console.log(`[DEBUG] Dial Response Status: ${response.status}`);
    console.log(`[DEBUG] Dial Response Body: ${responseText}`);

    return res.status(response.status).json({
      success: response.ok,
      gateway_response: responseText
    });

  } catch (err) {
    console.error("[CRITICAL] Dial Script Crash:", err.message);
    return res.status(500).json({ success: false, error: err.message });
  }
}
