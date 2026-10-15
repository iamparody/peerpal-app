importScripts('https://www.gstatic.com/firebasejs/10.12.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.12.0/firebase-messaging-compat.js');

if (!firebase.apps.length) {
  firebase.initializeApp({
    apiKey: 'AIzaSyCbqGbM3tEyL3fmcxTzC2le5zMsAQlkErY',
    authDomain: 'mindbridge-3b02d.firebaseapp.com',
    projectId: 'mindbridge-3b02d',
    storageBucket: 'mindbridge-3b02d.firebasestorage.app',
    messagingSenderId: '142389456351',
    appId: '1:142389456351:web:ace00b86d0559e4d2c286a',
  });
}

const messaging = firebase.messaging();

// Rendering + routing live in sw-notifications.js (unit-tested).
importScripts('/sw-notifications.js');
const { buildNotification, resolveClickPath } = self.PeerPalNotifications;

// Backend sends data-only messages (src/backend/utils/fcm.js), so this handler is the only
// thing that displays a background push. Returning the promise keeps the SW alive until shown.
messaging.onBackgroundMessage((payload) => {
  const { title, options } = buildNotification(payload);
  return self.registration.showNotification(title, options);
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const d = event.notification.data || {};
  const action = event.action;
  const path = resolveClickPath(d, action);
  if (!path) return;

  event.waitUntil(
    openOrFocus(path).then(() => {
      // Relay tap to app for analytics tracking
      return clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
        list.forEach((c) => c.postMessage({ type: 'NOTIFICATION_TAPPED', notif_type: d.type || null, action: action || null }));
      });
    })
  );
});

function openOrFocus(path) {
  return clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
    for (const c of list) {
      if ('focus' in c) {
        c.focus();
        if (c.navigate) c.navigate(path);
        return;
      }
    }
    if (clients.openWindow) clients.openWindow(path);
  });
}
