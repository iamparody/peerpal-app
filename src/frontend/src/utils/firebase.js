import { initializeApp, getApps } from 'firebase/app';
import { getMessaging, getToken, onMessage } from 'firebase/messaging';
import client from '../api/client';

const firebaseConfig = {
  apiKey:            import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain:        import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId:         import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket:     import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId:             import.meta.env.VITE_FIREBASE_APP_ID,
};

function getApp() {
  return getApps().length ? getApps()[0] : initializeApp(firebaseConfig);
}

// Call once after the user logs in.
// Prompts for notification permission if not yet decided, then registers the FCM
// token and sends it to the backend via PATCH /api/profile.
export async function registerFCMToken() {
  if (!('Notification' in window) || !('serviceWorker' in navigator)) return;
  if (!import.meta.env.VITE_FIREBASE_API_KEY) return;
  if (Notification.permission === 'denied') return;

  try {
    if (Notification.permission === 'default') {
      const perm = await Notification.requestPermission();
      if (perm !== 'granted') return;
    }
    const messaging = getMessaging(getApp());
    const sw = await navigator.serviceWorker.ready;
    const token = await getToken(messaging, {
      vapidKey: import.meta.env.VITE_FIREBASE_VAPID_KEY,
      serviceWorkerRegistration: sw,
    });
    if (token) {
      await client.patch('/api/profile', { fcm_token: token }).catch(() => {});
    }
  } catch (err) {
    console.warn('[FCM] token registration failed:', err.message);
  }
}

// Returns the current FCM registration state without side effects.
// status: 'active' | 'denied' | 'pending' | 'unsupported' | 'error'
export async function getFCMStatus() {
  if (!('Notification' in window) || !('serviceWorker' in navigator)) {
    return { status: 'unsupported', token: null };
  }
  if (!import.meta.env.VITE_FIREBASE_API_KEY) {
    return { status: 'unsupported', token: null };
  }
  if (Notification.permission === 'denied') {
    return { status: 'denied', token: null };
  }
  if (Notification.permission === 'default') {
    return { status: 'pending', token: null };
  }
  try {
    const messaging = getMessaging(getApp());
    const sw = await navigator.serviceWorker.ready;
    const token = await getToken(messaging, {
      vapidKey: import.meta.env.VITE_FIREBASE_VAPID_KEY,
      serviceWorkerRegistration: sw,
    });
    return token ? { status: 'active', token } : { status: 'error', token: null };
  } catch (err) {
    const code = err.code || err.message || 'unknown';
    console.warn('[FCM] status check failed:', code, err);
    return { status: 'error', token: null, errorCode: code };
  }
}

// Subscribe to foreground messages (app is open).
// Returns an unsubscribe function.
export function onForegroundMessage(handler) {
  if (!import.meta.env.VITE_FIREBASE_API_KEY) return () => {};
  try {
    const messaging = getMessaging(getApp());
    return onMessage(messaging, handler);
  } catch {
    return () => {};
  }
}
