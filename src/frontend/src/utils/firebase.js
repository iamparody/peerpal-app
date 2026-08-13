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
// Requests notification permission, registers the SW, obtains the FCM token,
// and sends it to the backend via PATCH /api/profile.
export async function registerFCMToken() {
  if (!('Notification' in window)) return;
  if (!('serviceWorker' in navigator)) return;
  if (!import.meta.env.VITE_FIREBASE_API_KEY) return;

  try {
    const permission = await Notification.requestPermission();
    if (permission !== 'granted') return;

    const messaging = getMessaging(getApp());
    const sw = await navigator.serviceWorker.register('/firebase-messaging-sw.js', { scope: '/' });
    const token = await getToken(messaging, {
      vapidKey: import.meta.env.VITE_FIREBASE_VAPID_KEY,
      serviceWorkerRegistration: sw,
    });

    if (token) {
      await client.patch('/api/profile', { fcm_token: token });
    }
  } catch (err) {
    console.warn('[FCM] token registration failed:', err.message);
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
