const admin = require('firebase-admin');

let initialized = false;

function initFCM() {
  if (initialized) return;
  let serviceAccount = null;
  if (process.env.FCM_SERVICE_ACCOUNT_JSON) {
    try { serviceAccount = JSON.parse(process.env.FCM_SERVICE_ACCOUNT_JSON); }
    catch (err) { console.error('FCM: invalid FCM_SERVICE_ACCOUNT_JSON:', err.message); }
  } else if (process.env.FCM_SERVICE_ACCOUNT_PATH) {
    try {
      const fs = require('fs');
      serviceAccount = JSON.parse(fs.readFileSync(process.env.FCM_SERVICE_ACCOUNT_PATH, 'utf8'));
    } catch (err) { console.error('FCM: cannot read FCM_SERVICE_ACCOUNT_PATH:', err.message); }
  }
  if (!serviceAccount) return;
  try {
    admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
    initialized = true;
  } catch (err) { console.error('FCM init failed:', err.message); }
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
    console.warn('FCM send failed:', err.message);
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
