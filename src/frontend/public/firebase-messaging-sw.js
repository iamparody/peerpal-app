importScripts('https://www.gstatic.com/firebasejs/10.12.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.12.0/firebase-messaging-compat.js');

firebase.initializeApp({
  apiKey: 'AIzaSyCbqGbM3tEyL3fmcxTzC2le5zMsAQlkErY',
  authDomain: 'mindbridge-3b02d.firebaseapp.com',
  projectId: 'mindbridge-3b02d',
  storageBucket: 'mindbridge-3b02d.firebasestorage.app',
  messagingSenderId: '142389456351',
  appId: '1:142389456351:web:ace00b86d0559e4d2c286a',
});

const messaging = firebase.messaging();

messaging.onBackgroundMessage((payload) => {
  const notif = payload.notification || {};
  self.registration.showNotification(notif.title || 'PeerPal', {
    body: notif.body || 'You have a new notification.',
    icon: '/pwa-192x192.png',
    badge: '/pwa-64x64.png',
    tag: payload.data?.type || 'peerpal',
    data: payload.data || {},
  });
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const path = event.notification.data?.type === 'peer_request_broadcast' ? '/peer' : '/';
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const c of clientList) {
        if ('focus' in c) { c.focus(); return c.navigate ? c.navigate(path) : null; }
      }
      if (clients.openWindow) return clients.openWindow(path);
    })
  );
});
