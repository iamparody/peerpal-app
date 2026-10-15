// Notification rendering + click routing for the service worker.
// Loaded by firebase-messaging-sw.js via importScripts, and by
// tests/sw-notifications.test.mjs in a vm sandbox. Keep it dependency-free.
//
// Sound: the Web Notifications API has no per-notification sound in any browser, so a
// background push plays the phone's default notification sound. What we control is the
// vibration pattern (peer requests get a long ring-like pattern no other type uses) and,
// when the app is open, the in-app ringtone (src/utils/peerRequestAlert.js).
// A custom background ringtone needs a native app (Android notification channel).
(function (root) {
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

    trial_reminder: {
      title: () => 'Trial ends tomorrow',
      body: () => 'Everything you experienced is still here when you top up.',
      vibrate: [100],
      requireInteraction: false,
      renotify: false,
      actions: [{ action: 'topup', title: 'Top up' }],
    },
  };

  // Fallback for any type not in the map above. title/body come from the FCM data
  // payload (backend utils/fcm.js puts them there). A title equal to the raw type
  // string is an internal key, never user copy.
  const FALLBACK_NOTIF = {
    title: (d) => (d.title && d.title !== d.type ? d.title : 'PeerPal'),
    body:  (d) => d.body || 'You have a new notification.',
    vibrate: [150],
    requireInteraction: false,
    renotify: false,
    actions: [],
  };

  // Static type → path. peer_request_broadcast and session_confirmation need ids from
  // the payload and are resolved in resolveClickPath.
  const TYPE_ROUTES = {
    peer_left:              '/peer',
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
    trial_reminder:          '/credits',
    trial_expired:           '/credits',
  };

  const ACTION_ROUTES = {
    topup:   () => '/credits',
    peer:    () => '/peer',
    checkin: () => '/mood',
    journal: () => '/journal',
    accept:  (d) => `/peer?highlight=${d.request_id || ''}`,
    join:    (d) => (d.session_id ? `/peer/session/${d.session_id}/bridge` : null),
  };

  // FCM payload → { title, options } for registration.showNotification.
  function buildNotification(payload, now) {
    const d = (payload && payload.data) || {};
    const type = d.type || '';
    const cfg = NOTIF_TYPES[type] || FALLBACK_NOTIF;
    return {
      title: cfg.title(d, payload),
      options: {
        body: cfg.body(d, payload),
        icon: '/blob-neutral.png',
        badge: '/badge.png',
        // One tag per type: a newer peer request replaces the older one instead of stacking.
        tag: type || 'peerpal-general',
        data: d,
        vibrate: cfg.vibrate,
        renotify: cfg.renotify,
        requireInteraction: cfg.requireInteraction,
        silent: false,
        timestamp: now === undefined ? Date.now() : now,
        actions: cfg.actions,
      },
    };
  }

  // Tap or action button → path to open, or null to just dismiss.
  function resolveClickPath(d, action) {
    d = d || {};
    if (action === 'skip' || action === 'dismiss') return null;
    if (action && ACTION_ROUTES[action]) {
      const p = ACTION_ROUTES[action](d);
      if (p) return p;
    }
    if (d.type === 'peer_request_broadcast') return `/peer?highlight=${d.request_id || ''}`;
    if (d.type === 'session_confirmation') return d.session_id ? `/peer/session/${d.session_id}/bridge` : '/peer';
    return TYPE_ROUTES[d.type] || d.route || '/';
  }

  root.PeerPalNotifications = { NOTIF_TYPES, FALLBACK_NOTIF, buildNotification, resolveClickPath };
})(self);
