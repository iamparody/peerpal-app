const admin = require('firebase-admin');

let initialized = false;

function initFCM() {
  if (initialized) return;
  let serviceAccount = null;
  if (process.env.FCM_SERVICE_ACCOUNT_JSON) {
    try {
      serviceAccount = JSON.parse(process.env.FCM_SERVICE_ACCOUNT_JSON);
      // Render and similar platforms escape newlines in env vars as \\n; fix private key.
      if (serviceAccount.private_key) {
        serviceAccount.private_key = serviceAccount.private_key.replace(/\\n/g, '\n');
      }
    } catch (err) { console.error('[FCM] Invalid FCM_SERVICE_ACCOUNT_JSON:', err.message); }
  } else if (process.env.FCM_SERVICE_ACCOUNT_PATH) {
    try {
      const fs = require('fs');
      serviceAccount = JSON.parse(fs.readFileSync(process.env.FCM_SERVICE_ACCOUNT_PATH, 'utf8'));
    } catch (err) { console.error('[FCM] Cannot read FCM_SERVICE_ACCOUNT_PATH:', err.message); }
  } else {
    console.warn('[FCM] No FCM credentials configured — push notifications disabled. Set FCM_SERVICE_ACCOUNT_JSON in env.');
    return;
  }
  if (!serviceAccount) return;
  try {
    admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
    initialized = true;
    console.log('[FCM] Firebase Admin SDK initialized — push notifications enabled.');
  } catch (err) { console.error('[FCM] Init failed:', err.message); }
}

// Builds the FCM message. Data-only on purpose: all our tokens are web (PWA) tokens, and a
// top-level `notification` block makes the Firebase SW SDK display its own plain notification
// AND call our onBackgroundMessage, so every push showed twice. The service worker
// (public/firebase-messaging-sw.js) renders everything from `data`, with title/body as fallback.
//
// Control keys (stripped from the payload):
//   _urgent: 'true'  → Urgency: high (wakes the device from Doze)
//   _ttl:    seconds → drop the push if it cannot be delivered within this window
function buildFcmMessage(fcm_token, title, body, data = {}) {
  const payload = {};
  for (const [k, v] of Object.entries(data)) {
    if (k.startsWith('_') || v === undefined || v === null) continue;
    payload[k] = String(v);
  }
  if (payload.title === undefined && title) payload.title = String(title);
  if (payload.body === undefined && body) payload.body = String(body);

  const headers = { Urgency: data._urgent === 'true' ? 'high' : 'normal' };
  const ttl = parseInt(data._ttl, 10);
  if (Number.isFinite(ttl) && ttl >= 0) headers.TTL = String(ttl);

  return { token: fcm_token, data: payload, webpush: { headers } };
}

// Direct delivery — used by notificationWorker and as fallback.
async function sendPushNotification(fcm_token, title, body, data = {}) {
  initFCM();
  if (!initialized || !fcm_token) return;
  try {
    await admin.messaging().send(buildFcmMessage(fcm_token, title, body, data));
  } catch (err) {
    // Token expired / unregistered — clear it so we don't re-send to dead tokens
    if (err.code === 'messaging/registration-token-not-registered' ||
        err.code === 'messaging/invalid-registration-token') {
      const { query } = require('../db');
      await query('UPDATE users SET fcm_token = NULL WHERE fcm_token = $1', [fcm_token])
        .catch(() => {});
    }
    console.warn('[FCM] Send failed:', err.code || err.message);
  }
}

// Enqueue for async delivery — falls back to direct send if queue is down.
async function enqueuePushNotification(fcm_token, title, body, data = {}) {
  if (!fcm_token) return;
  const { notificationQueue } = require('../queues');
  if (notificationQueue) {
    try {
      await notificationQueue.add('push', { fcm_token, title, body, data });
      return;
    } catch (err) {
      console.warn('[fcm] Queue unavailable, falling back to direct send:', err.message);
    }
  }
  await sendPushNotification(fcm_token, title, body, data);
}

// A device token belongs to exactly one account. FCM tokens are per browser, so on a shared
// phone the previous account's token row must be cleared, or user B's device keeps receiving
// user A's (mental-health) notifications.
async function assignFcmToken(query, userId, fcm_token) {
  if (fcm_token) {
    await query('UPDATE users SET fcm_token = NULL WHERE fcm_token = $1 AND id <> $2', [fcm_token, userId]);
  }
  await query('UPDATE users SET fcm_token = $1, updated_at = NOW() WHERE id = $2', [fcm_token || null, userId]);
}

module.exports = { sendPushNotification, enqueuePushNotification, buildFcmMessage, assignFcmToken };
