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

// Per-type notification config.
// Each entry defines how to render a background push for that notification type.
// Keys used in each entry:
//   title(d)       — function(data) → string
//   body(d)        — function(data) → string
//   vibrate        — vibration pattern array
//   requireInteraction — bool: stays on screen until user acts
//   renotify       — bool: replace same-tag or stack
//   actions        — array of { action, title }
const NOTIF_TYPES = {
  peer_request_broadcast: {
    title: () => 'Someone needs your support',
    body: (d) => {
      const ch = d.channel_preference === 'voice' ? 'Voice session' : 'Text session';
      return d.topic_label ? `${d.topic_label} · ${ch}` : ch;
    },
    vibrate: [300, 100, 300, 100, 300, 200, 600],
    requireInteraction: true,
    renotify: true,
    actions: [
      { action: 'accept', title: "I'm ready" },
      { action: 'skip',   title: 'Not now'   },
    ],
  },

  session_confirmation: {
    title: () => 'Your peer is ready',
    body: (d) => {
      const ch = (d.channel || d.channel_preference) === 'voice' ? 'Voice session' : 'Chat session';
      return `${ch} starting — tap to join`;
    },
    vibrate: [200, 100, 200, 100, 200],
    requireInteraction: true,
    renotify: false,
    actions: [{ action: 'join', title: 'Join now' }],
  },

  peer_left: {
    title: () => 'Session ended',
    body: () => 'Your peer has left. Take care of yourself.',
    vibrate: [100],
    requireInteraction: false,
    renotify: false,
    actions: [],
  },

  credit_low: {
    title: () => 'Credits running low',
    body: (d) => {
      const b = d.balance;
      return b ? `You have ${b} credit${b === '1' ? '' : 's'} left. Top up to stay connected.`
               : 'You have very few credits. Top up to continue.';
    },
    vibrate: [100, 50, 100],
    requireInteraction: false,
    renotify: false,
    actions: [{ action: 'topup', title: 'Top up' }],
  },

  peer_matching_update: {
    title: () => 'Still here for you',
    body: () => "We couldn't find a peer right now — your calm space is ready.",
    vibrate: [100],
    requireInteraction: false,
    renotify: false,
    actions: [],
  },

  check_in_reminder: {
    title: () => 'How are you feeling today?',
    body: () => 'A quick check-in can make a real difference.',
    vibrate: [100],
    requireInteraction: false,
    renotify: false,
    actions: [{ action: 'checkin', title: 'Check in' }],
  },

  streak_reminder: {
    title: () => 'Keep your streak going',
    body: (d) => d.streak_count ? `${d.streak_count} days — don't break it now.` : 'Log your mood today to keep your streak.',
    vibrate: [100],
    requireInteraction: false,
    renotify: false,
    actions: [],
  },

  streak_broken: {
    title: () => "Streak reset — that's okay",
    body: () => "Every day is a fresh start. Check in when you're ready.",
    vibrate: [100],
    requireInteraction: false,
    renotify: false,
    actions: [],
  },

  milestone: {
    title: () => 'You hit a milestone',
    body: (d) => d.message || 'Keep going — you\'re building something real.',
    vibrate: [100, 50, 200, 50, 100],
    requireInteraction: false,
    renotify: false,
    actions: [],
  },

  session_followup_peer: {
    title: () => 'How are you doing?',
    body: () => 'You supported someone today. Check in with yourself too.',
    vibrate: [100],
    requireInteraction: false,
    renotify: false,
    actions: [{ action: 'checkin', title: 'Check in' }],
  },

  session_followup_therapy: {
    title: () => 'Reflection time',
    body: () => 'Your therapy session has ended. Writing something down can help it land.',
    vibrate: [100],
    requireInteraction: false,
    renotify: false,
    actions: [{ action: 'journal', title: 'Open journal' }],
  },

  dormant_nudge: {
    title: () => 'We missed you',
    body: () => "It has been a while. Come back at your own pace — we're here.",
    vibrate: [100],
    requireInteraction: false,
    renotify: false,
    actions: [],
  },

  ai_dormant: {
    title: () => 'Your companion is waiting',
    body: () => "Start a conversation whenever you're ready.",
    vibrate: [100],
    requireInteraction: false,
    renotify: false,
    actions: [],
  },

  journal_prompt: {
    title: () => 'Something to write about',
    body: (d) => d.prompt || 'Open your journal and put something on the page.',
    vibrate: [100],
    requireInteraction: false,
    renotify: false,
    actions: [{ action: 'journal', title: 'Write now' }],
  },

  credit_zero: {
    title: () => 'No credits remaining',
    body: () => 'Top up to request peer support or book a therapy session.',
    vibrate: [100, 50, 100],
    requireInteraction: false,
    renotify: false,
    actions: [{ action: 'topup', title: 'Top up' }],
  },

  no_safety_plan: {
    title: () => 'Set up your safety plan',
    body: () => 'Having one ready — even a simple one — makes a difference in hard moments.',
    vibrate: [100],
    requireInteraction: false,
    renotify: false,
    actions: [],
  },

  therapist_upsell: {
    title: () => 'Ready for deeper support?',
    body: () => 'Browse therapists on PeerPal and express interest in minutes.',
    vibrate: [100],
    requireInteraction: false,
    renotify: false,
    actions: [],
  },

  unmatched_request: {
    title: () => 'No peer found this time',
    body: () => 'Your credits have been refunded. Try again or visit your calm space.',
    vibrate: [100],
    requireInteraction: false,
    renotify: false,
    actions: [],
  },

  first_call_nudge: {
    title: () => 'PeerPal',
    body: () => 'Someone is ready to listen when you are.',
    vibrate: [100],
    requireInteraction: false,
    renotify: false,
    actions: [{ action: 'peer', title: 'Talk to someone' }],
  },

  bad_mood_followup: {
    title: () => 'Checking in on you',
    body: () => 'You logged a tough mood earlier. How are you feeling now?',
    vibrate: [100],
    requireInteraction: false,
    renotify: false,
    actions: [{ action: 'checkin', title: 'Check in' }],
  },

  low_mood_streak: {
    title: () => "We're thinking of you",
    body: () => "You've been having a rough stretch. Peer support or a calm space might help.",
    vibrate: [100],
    requireInteraction: false,
    renotify: false,
    actions: [],
  },
};

// Fallback config for any type not in the map above.
const FALLBACK_NOTIF = {
  title: (_, payload) => payload.notification?.title || 'PeerPal',
  body:  (_, payload) => payload.notification?.body  || 'You have a new notification.',
  vibrate: [150],
  requireInteraction: false,
  renotify: false,
  actions: [],
};

messaging.onBackgroundMessage((payload) => {
  const d    = payload.data || {};
  const type = d.type || '';
  const cfg  = NOTIF_TYPES[type] || FALLBACK_NOTIF;

  const title = cfg.title(d, payload);
  const body  = cfg.body(d, payload);

  self.registration.showNotification(title, {
    body,
    icon:               '/blob-neutral.png',
    badge:              '/badge.png',
    tag:                type || 'peerpal-general',
    data:               d,
    vibrate:            cfg.vibrate,
    renotify:           cfg.renotify,
    requireInteraction: cfg.requireInteraction,
    actions:            cfg.actions,
  });
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const d      = event.notification.data || {};
  const action = event.action;

  // Action-specific routes take priority
  if (action === 'skip' || action === 'dismiss') return;
  if (action === 'join' && d.session_id) {
    return event.waitUntil(openOrFocus(`/peer/session/${d.session_id}/bridge`));
  }
  if (action === 'accept') {
    return event.waitUntil(openOrFocus(`/peer?highlight=${d.request_id || ''}`));
  }
  if (action === 'topup')   return event.waitUntil(openOrFocus('/credits'));
  if (action === 'peer')    return event.waitUntil(openOrFocus('/peer'));
  if (action === 'checkin') return event.waitUntil(openOrFocus('/mood'));
  if (action === 'journal') return event.waitUntil(openOrFocus('/journal'));

  // Type-based fallback routes
  const routes = {
    peer_request_broadcast:  `/peer?highlight=${d.request_id || ''}`,
    session_confirmation:    d.session_id ? `/peer/session/${d.session_id}/bridge` : '/peer',
    peer_left:               '/peer',
    credit_low:              '/credits',
    credit_zero:             '/credits',
    peer_matching_update:    '/calm-space',
    check_in_reminder:       '/mood',
    streak_reminder:         '/mood',
    streak_broken:           '/mood',
    dormant_nudge:           '/mood',
    bad_mood_followup:       '/mood',
    session_followup_peer:   '/mood',
    session_followup_therapy:'/journal',
    journal_prompt:          '/journal',
    ai_dormant:              '/ai',
    no_safety_plan:          '/safety-plan',
    low_mood_streak:         '/peer',
    therapist_upsell:        '/therapy/browse',
    unmatched_request:       '/peer',
  };

  const path = routes[d.type] || d.route || '/';
  event.waitUntil(openOrFocus(path));
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
