const https = require('https');

// Fetches short-lived TURN credentials from Twilio Network Traversal Service.
// Called per-session — tokens are not cached (they rotate, are short-lived, per-session).
// Returns { ice_servers: [...], ttl: number }
async function getTurnCredentials() {
  const sid = process.env.TWILIO_ACCOUNT_SID;
  const token = process.env.TWILIO_AUTH_TOKEN;

  if (!sid || !token) {
    throw new Error('TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN are required');
  }

  const auth = Buffer.from(`${sid}:${token}`).toString('base64');
  const url = `https://api.twilio.com/2010-04-01/Accounts/${sid}/Tokens.json`;

  return new Promise((resolve, reject) => {
    const req = https.request(url, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${auth}`,
        'Content-Length': 0,
      },
    }, (res) => {
      let body = '';
      res.on('data', (chunk) => { body += chunk; });
      res.on('end', () => {
        if (res.statusCode !== 201) {
          return reject(new Error(`Twilio NTS error ${res.statusCode}: ${body}`));
        }
        try {
          const data = JSON.parse(body);
          resolve({
            ice_servers: data.ice_servers,
            ttl: data.ttl,
          });
        } catch (err) {
          reject(new Error(`Failed to parse Twilio NTS response: ${err.message}`));
        }
      });
    });

    req.on('error', reject);
    req.end();
  });
}

// Builds ICE server list from Metered.ca static credentials (env fallback).
function getStaticTurnCredentials() {
  const username   = process.env.TURN_USERNAME;
  const credential = process.env.TURN_CREDENTIAL;
  if (!username || !credential) return null;
  return {
    ice_servers: [
      { urls: 'stun:stun.relay.metered.ca:80' },
      { urls: 'turn:global.relay.metered.ca:80',                 username, credential },
      { urls: 'turn:global.relay.metered.ca:80?transport=tcp',   username, credential },
      { urls: 'turn:global.relay.metered.ca:443',                username, credential },
      { urls: 'turns:global.relay.metered.ca:443?transport=tcp', username, credential },
    ],
  };
}

// Returns TURN credentials — tries Twilio NTS first, falls back to Metered.ca static creds.
async function getTurnCredentialsWithFallback() {
  try {
    return await getTurnCredentials();
  } catch {
    return getStaticTurnCredentials();
  }
}

module.exports = { getTurnCredentials, getTurnCredentialsWithFallback };
