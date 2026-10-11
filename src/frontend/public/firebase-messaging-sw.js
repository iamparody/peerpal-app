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

messaging.onBackgroundMessage((payload) => {
  const notif = payload.notification || {};
  const data  = payload.data   || {};
  const isPeerRequest = data.type === 'peer_request_broadcast';

  const options = {
    body:              isPeerRequest ? 'A peer is waiting. Tap to help.' : (notif.body || 'You have a new notification.'),
    icon:              '/pwa-192x192.png',
    badge:             '/pwa-64x64.png',
    tag:               data.type || 'peerpal',
    data,
    renotify:          isPeerRequest,
    requireInteraction: isPeerRequest,   // stay on screen until user acts — not auto-dismissed
    vibrate:           isPeerRequest
                         ? [300, 100, 300, 100, 300, 200, 600]
                         : [200],
    actions:           isPeerRequest
      ? [
          { action: 'accept', title: "I'm ready" },
          { action: 'skip',   title: 'Skip'      },
        ]
      : [],
  };

  self.registration.showNotification(
    isPeerRequest ? 'Someone needs your support' : (notif.title || 'PeerPal'),
    options
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const d      = event.notification.data || {};
  const action = event.action;

  // "Skip" action on a peer request — dismiss, do nothing
  if (action === 'skip') return;

  let path = d.route || '/';
  if (d.type === 'peer_request_broadcast')                               path = '/peer';
  else if (d.type === 'peer_matching_update' && d.cta === 'calm_space') path = '/calm-space';
  else if (d.type === 'peer_left')                                       path = '/peer';
  else if (d.type === 'streak_reminder')                                 path = '/mood';
  else if (d.type === 'streak_broken')                                   path = '/mood';
  else if (d.type === 'dormant_nudge')                                   path = '/mood';
  else if (d.type === 'bad_mood_followup')                               path = '/mood';
  else if (d.type === 'session_followup_peer')                           path = '/mood';
  else if (d.type === 'session_followup_therapy')                        path = '/journal';
  else if (d.type === 'unmatched_request')                               path = '/peer';
  else if (d.type === 'ai_dormant')                                      path = '/ai';
  else if (d.type === 'credit_low')                                      path = '/credits';
  else if (d.type === 'credit_zero')                                     path = '/credits';
  else if (d.type === 'no_safety_plan')                                  path = '/safety-plan';
  else if (d.type === 'low_mood_streak')                                 path = '/peer';
  else if (d.type === 'therapist_upsell')                                path = '/therapy/browse';
  else if (d.type === 'journal_prompt')                                  path = '/journal';

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const c of clientList) {
        if ('focus' in c) { c.focus(); return c.navigate ? c.navigate(path) : null; }
      }
      if (clients.openWindow) return clients.openWindow(path);
    })
  );
});
