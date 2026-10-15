# Peer-request push notifications

How a peer's phone finds out that someone is requesting a session, and the rules that decide who gets alerted.

## Outcome

**Metric:** peer-request match rate (requests accepted by a peer / requests made), split by day and night, and push reach (requests where at least one peer got a push).

**How to see it:** `node scripts/peer_push_report.js 14` (from `src/backend`, read-only). Each broadcast also logs one trace line:

```
[peer-push] request=3f2a9c1e candidates=12 eligible=4 sent=4 dup=0 quiet=false ttl=130
```

`candidates` = peers routed to this tier, `eligible` = passed the rules below, `sent` = pushes enqueued, `dup` = already pushed for this request on that device, `ttl` = seconds the push stays deliverable.

## Flow

```
POST /api/peer/request
  └─ broadcastToUsers (routes/peer.js)            tier 1 at T+0, tier 2 at T+60s
       ├─ in-app notification rows (always)
       └─ broadcastPeerRequestPush (services/peerRequestPush.js)
            ├─ eligibility query (rules below)
            ├─ dedup claim per (device token, request)   Redis SET NX EX, local fallback
            └─ enqueuePushNotification (utils/fcm.js)    BullMQ → notificationWorker → FCM
                 └─ data-only web push, Urgency: high, TTL = time left on the request
Service worker (public/firebase-messaging-sw.js + public/sw-notifications.js)
  └─ onBackgroundMessage → showNotification (ring vibration, stays until tapped,
                                              "I'm ready" / "Not now")
App open (App.jsx PeerRequestBanner, PeerRequestScreen; 3s poll)
  ├─ banner + in-app ringtone (utils/peerRequestAlert.js)
  └─ closes system notifications for requests that are no longer open
```

## Who gets pushed

All must hold (`SELECT_PUSH_TARGETS_SQL`):

| Rule | Column | Set by |
|---|---|---|
| Has a device token | `users.fcm_token` | Push permission prompt (asked when the peer goes available) |
| Has not turned off peer-request alerts | `users.notif_peer_broadcast` | Profile → Notifications |
| Availability window is active | `users.peer_available_until > NOW()` | Peer → Availability |
| During quiet hours (22:00–07:00 EAT), opted in to night alerts | `users.notif_peer_night` (default false) | Peer → Availability → Night alerts |
| Not already in an active session | `peer_requests.status = 'active'` | |

In-app notifications are written for every candidate regardless of these rules.

## Design decisions

- **Data-only FCM messages.** A top-level `notification` block makes the Firebase SW SDK display its own plain notification and also call `onBackgroundMessage`, so every push showed twice: once without actions or vibration, with click routing we don't control. All rendering now lives in the service worker. `title`/`body` travel in `data` for the fallback renderer.
- **TTL = time left on the request** (`escalate_at - now`, about 130s for tier 1 and 70s for tier 2). The old 30s TTL dropped pushes to phones that were briefly offline or in Doze, even though the request was still open. A push delivered after the request expires would point at nothing, so it is skipped when less than 15s is left.
- **Dedup in Redis, keyed by hashed token.** It replaces an in-process Map that a restart wiped and multiple instances didn't share. It covers tier 1 + tier 2, the routing cron replay after restarts, and two accounts that share one device token. Raw tokens never go into Redis keys.
- **One device token, one account** (`assignFcmToken`). FCM tokens belong to a browser, not a user. Without this, after user A logs out and user B logs in on the same phone, the phone kept receiving A's notifications. Logout releases the token; login re-claims it when permission is already granted (never prompts).
- **One tag for all peer-request notifications.** A newer request replaces the older one rather than stacking a pile of alerts that are mostly expired. The app closes notifications for requests that are no longer open whenever it polls.
- **Night alerts are opt-in and still need an availability window.** Default off: nobody is woken at night unless they asked for it.

## Sound

- **App open:** a rising C5-E5-G5 ringtone played twice (`utils/peerRequestAlert.js`). It is deliberately different from the 660/880 Hz pair used for therapist calls. A shared gate stops the banner and the Peer screen from ringing twice, and one AudioContext is reused instead of creating one per beep.
- **App closed:** the Web Notifications API has no per-notification sound in any browser, so the phone plays its default notification sound. The peer-request vibration pattern (about 1.7s, ring-like) is unique to this type. On Android a user can pick a custom sound for PeerPal in system notification settings.
- **True ringtone / full-screen incoming call:** needs a native wrapper (Capacitor + Android notification channel with a custom sound and a full-screen intent; CallKit on iOS). This is out of scope for the web push design.

## Platform limits

- Android Chrome / installed PWA: full support.
- iPhone: web push only works when PeerPal is added to the Home Screen (iOS 16.4+).
- Permission denied at the browser level cannot be re-prompted from the app; the Availability tab explains how to re-enable it.

## Deploy order

1. `npm run migrate` (applies `105_peer_night_alerts.sql`). **Must run before the backend deploys.** The eligibility query references `notif_peer_night`, and without the column every broadcast push fails (in-app notifications still work).
2. Deploy the backend.
3. Deploy the frontend (new service worker; clients pick it up on next load via `autoUpdate`).

Rollback: `105_peer_night_alerts_rollback.sql` after reverting the backend.

## Tests

- `src/backend`: `npm run test:push`. Eligibility rules, quiet hours, TTL, dedup, FCM message shape, token ownership, report math.
- `src/frontend`: `npm test`. Service worker rendering and click routing (vm sandbox), ringtone schedule, ring gate, stale-notification selection.

Manual device check (needs a real phone): see the checklist in PROGRESS.md for this change.
