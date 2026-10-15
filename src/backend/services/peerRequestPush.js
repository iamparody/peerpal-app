// Peer-request push delivery: who gets pushed, for how long the push is valid,
// and cross-tier / cross-instance dedup. Design doc: docs/peer-request-push.md
//
// All time and I/O dependencies are injectable so the rules are unit-testable
// (tests/peerRequestPush.test.js) without a DB, Redis or Firebase.

const crypto = require('crypto');

// Nairobi quiet hours (EAT = UTC+3, no DST): 22:00–07:00.
const QUIET_START_HOUR_EAT = 22;
const QUIET_END_HOUR_EAT = 7;

// Request lifecycle fallback when escalate_at is unknown (matches POST /peer/request).
const DEFAULT_REQUEST_LIFETIME_SECONDS = 130;

// A push that would arrive with less time than this left to accept is noise: skip it.
const MIN_PUSH_TTL_SECONDS = 15;

// Dedup window. Must outlive the request (130s) plus routingJob cron lag (runs every 2 min),
// because the cron can re-run broadenToGeneralTier after a restart.
const DEDUP_TTL_SECONDS = 10 * 60;

function isQuietHour(now = new Date()) {
  const eatHour = (now.getUTCHours() + 3) % 24;
  return eatHour >= QUIET_START_HOUR_EAT || eatHour < QUIET_END_HOUR_EAT;
}

// Seconds the push stays deliverable: the time left until the request escalates
// (no-peer refund). A push delivered after that points at a dead request.
function pushTtlSeconds(escalateAt, now = new Date()) {
  if (!escalateAt) return DEFAULT_REQUEST_LIFETIME_SECONDS;
  const ms = new Date(escalateAt).getTime() - now.getTime();
  if (Number.isNaN(ms)) return DEFAULT_REQUEST_LIFETIME_SECONDS;
  return Math.floor(ms / 1000);
}

// Redis key never contains the raw FCM token (it is a device credential).
function dedupKey(fcmToken, requestId) {
  const tokenHash = crypto.createHash('sha256').update(String(fcmToken)).digest('hex').slice(0, 24);
  return `peerpush:${requestId}:${tokenHash}`;
}

// In-memory fallback used only when Redis is unavailable (single-instance best effort).
const localClaims = new Map();

function claimLocally(key, nowMs) {
  for (const [k, exp] of localClaims) if (exp <= nowMs) localClaims.delete(k);
  if (localClaims.has(key)) return false;
  localClaims.set(key, nowMs + DEDUP_TTL_SECONDS * 1000);
  return true;
}

// Returns true if this (device, request) pair has not been pushed yet and is now claimed.
// Redis SET NX makes the claim atomic across backend instances and restarts.
async function claimPushSlot(fcmToken, requestId, { redis, nowMs = Date.now() } = {}) {
  const key = dedupKey(fcmToken, requestId);
  if (redis) {
    try {
      const res = await redis.set(key, '1', { nx: true, ex: DEDUP_TTL_SECONDS });
      return res === 'OK';
    } catch (err) {
      console.warn('[peer-push] redis dedup unavailable, using local fallback:', err.message);
    }
  }
  return claimLocally(key, nowMs);
}

// Eligibility, in one query so the rules live in one place:
//   - has a device token
//   - has not turned off peer-request alerts (Profile → notif_peer_broadcast)
//   - has an active availability window
//   - during quiet hours: has also opted in to night alerts (notif_peer_night)
//   - is not already in an active session
const SELECT_PUSH_TARGETS_SQL = `
  SELECT u.id, u.fcm_token
  FROM users u
  WHERE u.id = ANY($1::uuid[])
    AND u.fcm_token IS NOT NULL
    AND u.notif_peer_broadcast = true
    AND u.peer_available_until > NOW()
    AND ($2::boolean = false OR u.notif_peer_night = true)
    AND NOT EXISTS (
      SELECT 1 FROM peer_requests pr2
      WHERE pr2.accepted_by = u.id AND pr2.status = 'active'
    )`;

function buildPushContent(channelPreference, topicLabel) {
  const channelLabel = channelPreference === 'voice' ? 'Voice session' : 'Text session';
  return {
    title: 'Someone needs your support',
    body: topicLabel ? `${topicLabel} · ${channelLabel}` : channelLabel,
  };
}

// Sends the urgent push for one routing tier. Returns a summary that is also logged
// as a single trace line, so delivery reach is measurable per request.
async function broadcastPeerRequestPush({
  userIds, requestId, channelPreference, topicLabel, escalateAt,
  query, enqueue, redis = null, now = new Date(), log = console.log,
}) {
  const quiet = isQuietHour(now);
  const ttl = pushTtlSeconds(escalateAt, now);
  const summary = {
    request: String(requestId).slice(0, 8),
    candidates: userIds.length, eligible: 0, sent: 0, dup: 0,
    quiet, ttl, skipped: null, sentUserIds: [],
  };

  const trace = () => log(`[peer-push] request=${summary.request} candidates=${summary.candidates} eligible=${summary.eligible} sent=${summary.sent} dup=${summary.dup} quiet=${quiet} ttl=${ttl}${summary.skipped ? ` skipped=${summary.skipped}` : ''}`);

  if (!userIds.length) { summary.skipped = 'no_candidates'; trace(); return summary; }
  if (ttl < MIN_PUSH_TTL_SECONDS) { summary.skipped = 'request_expiring'; trace(); return summary; }

  const { rows: targets } = await query(SELECT_PUSH_TARGETS_SQL, [userIds, quiet]);
  summary.eligible = targets.length;

  const { title, body } = buildPushContent(channelPreference, topicLabel);

  for (const { id, fcm_token } of targets) {
    if (!(await claimPushSlot(fcm_token, requestId, { redis, nowMs: now.getTime() }))) {
      summary.dup += 1;
      continue;
    }
    try {
      await enqueue(fcm_token, title, body, {
        type: 'peer_request_broadcast',
        request_id: String(requestId),
        topic_label: topicLabel || '',
        channel_preference: channelPreference || 'text',
        _urgent: 'true',
        _ttl: String(ttl),
      });
      summary.sent += 1;
      summary.sentUserIds.push(id);
    } catch (err) {
      console.warn('[peer-push] enqueue error:', err.message);
    }
  }

  if (summary.sentUserIds.length) {
    await query(
      `INSERT INTO notifications (user_id, type, payload, channel)
       SELECT unnest($1::uuid[]), 'peer_request_broadcast', $2, 'push'`,
      [summary.sentUserIds, JSON.stringify({ request_id: requestId, channel_preference: channelPreference, ttl })]
    );
  }

  trace();
  return summary;
}

module.exports = {
  isQuietHour,
  pushTtlSeconds,
  dedupKey,
  claimPushSlot,
  buildPushContent,
  broadcastPeerRequestPush,
  SELECT_PUSH_TARGETS_SQL,
  MIN_PUSH_TTL_SECONDS,
  DEDUP_TTL_SECONDS,
  DEFAULT_REQUEST_LIFETIME_SECONDS,
  _localClaims: localClaims,
};
