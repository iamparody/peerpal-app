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

// Direct delivery — used by notificationWorker and as fallback.
async function sendPushNotification(fcm_token, title, body, data = {}) {
  initFCM();
  if (!initialized || !fcm_token) return;
  try {
    await admin.messaging().send({
      token: fcm_token,
      notification: { title, body },
      data: Object.fromEntries(Object.entries(data).map(([k, v]) => [k, String(v)])),
    });
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

module.exports = { sendPushNotification, enqueuePushNotification };
