import { randomUUID } from 'crypto';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*'); // Lock down in Prod
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ code: 405 });

  const { uid, destination, domain } = req.body;
  const authHeader = req.headers.authorization;

  if (!uid || !destination || !domain || !authHeader) {
    return res.status(400).json({ message: 'Missing required fields' });
  }

  // Ringlogix Format: sip:1<digits>@<domain>
  const sipDestination = `sip:1${destination}@${domain}`;
  const callId = `${randomUUID()}@ampdialer`;

  const params = new URLSearchParams();
  params.append('callid', callId);
  params.append('uid', uid);
  params.append('destination', sipDestination);

  try {
    const upstream = await fetch('https://api.ringlogix.com/pbx/v1/?object=call&action=call&format=json', {
      method: 'POST',
      headers: {
        'Authorization': authHeader,
        'Content-Type': 'application/x-www-form-urlencoded',
        'Accept': 'application/json'
      },
      body: params
    });

    const data = await upstream.json();

    // Pass upstream status code (400, 401, 200, 202)
    res.status(upstream.status).json(upstream.ok ? {} : data);
  } catch (e) {
    res.status(500).json({ message: 'Internal Server Error' });
  }
}
