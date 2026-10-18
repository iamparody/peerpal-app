const rateLimit = require('express-rate-limit');
const cache = require('../services/cache');

// ── Care-first login tracking ─────────────────────────────────────────────────
// Mental health context: never hard-lock a user out. After LOGIN_THRESHOLD failed
// attempts within a window, require a 30-second pause between attempts instead.
// Being locked out of a support app is a safety risk.
const loginStore = new Map();
const LOGIN_THRESHOLD = 15;
const LOGIN_COOLDOWN_MS = 30 * 1000;
const LOGIN_WINDOW_MS = 15 * 60 * 1000;
const LOGIN_WINDOW_SEC = Math.floor(LOGIN_WINDOW_MS / 1000);
const REDIS_LOGIN_PREFIX = 'login_fail:';

async function getRecord(ip) {
  try {
    const data = await cache.get(REDIS_LOGIN_PREFIX + ip);
    if (data) return data;
  } catch {}
  const r = loginStore.get(ip);
  if (!r) return null;
  if (Date.now() - r.lastFailedAt > LOGIN_WINDOW_MS) {
    loginStore.delete(ip);
    return null;
  }
  return r;
}

function recordFailedLogin(ip) {
  const r = loginStore.get(ip) || { failedCount: 0, lastFailedAt: 0 };
  const updated = { failedCount: r.failedCount + 1, lastFailedAt: Date.now() };
  loginStore.set(ip, updated);
  cache.set(REDIS_LOGIN_PREFIX + ip, updated, LOGIN_WINDOW_SEC).catch(() => {});
}

function clearLoginRecord(ip) {
  loginStore.delete(ip);
  cache.del(REDIS_LOGIN_PREFIX + ip).catch(() => {});
}

async function loginCooldownMiddleware(req, res, next) {
  const r = await getRecord(req.ip);
  if (r && r.failedCount >= LOGIN_THRESHOLD) {
    const elapsed = Date.now() - r.lastFailedAt;
    if (elapsed < LOGIN_COOLDOWN_MS) {
      const retryAfter = Math.ceil((LOGIN_COOLDOWN_MS - elapsed) / 1000);
      return res.status(429).json({
        error: 'Having trouble? Take a breath — you can keep trying.',
        code: 'COOLDOWN',
        retry_after: retryAfter,
      });
    }
  }
  next();
}

// ── Register / recover limiter ────────────────────────────────────────────────
// Slightly more lenient than original (10 vs 5) but still guards against abuse.
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many attempts — please try again in a few minutes', code: 'RATE_LIMITED' },
});

// ── General API ceiling ────────────────────────────────────────────────────────
const apiLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 120,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests', code: 'RATE_LIMITED' },
});

// ── Payment endpoints — tighter ceiling to reduce STK pump risk ───────────────
const paymentLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  keyGenerator: (req) => req.user?.id || req.ip,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many payment requests — please wait a minute', code: 'RATE_LIMITED' },
});

// ── AI message / session — per user, not per IP ──────────────────────────────
// 30 messages/min per user is already generous for a chat UI; defends against
// scripted LLM pumping that would drain Groq quota and rack up inference cost.
const aiMessageLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  keyGenerator: (req) => req.user?.id || req.ip,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Slow down — you\'re sending messages too fast', code: 'RATE_LIMITED' },
});

// 10 session starts/min per user — each start allocates DB rows and AI context.
const aiSessionLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  keyGenerator: (req) => req.user?.id || req.ip,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many session requests', code: 'RATE_LIMITED' },
});

// ── Transcription — tightest limit: Whisper call + 25 MB upload per request ──
// 5/min per user is still 300 transcriptions/hour — nobody legitimate needs more.
const transcribeLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 5,
  keyGenerator: (req) => req.user?.id || req.ip,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many transcription requests — please wait a moment', code: 'RATE_LIMITED' },
});

// ── Peer request — each fire broadcasts FCM to all online peers (O(n) pushes) ─
const peerRequestLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 15,
  keyGenerator: (req) => req.user?.id || req.ip,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many peer requests', code: 'RATE_LIMITED' },
});

// ── Public unauthenticated forms (analytics event, feedback) ─────────────────
// IP-based; 30/min is generous for legitimate use, stops simple floods.
const publicFormLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests', code: 'RATE_LIMITED' },
});

// ── Resend-verification rate limit: 3 per hour per user ───────────────────────
const resendStore = new Map();
const RESEND_MAX = 3;
const RESEND_WINDOW_MS = 60 * 60 * 1000;

function checkResendLimit(userId) {
  const now = Date.now();
  const r = resendStore.get(userId);
  if (!r || now - r.windowStart >= RESEND_WINDOW_MS) {
    resendStore.set(userId, { count: 1, windowStart: now });
    return true;
  }
  if (r.count >= RESEND_MAX) return false;
  r.count += 1;
  return true;
}

module.exports = { authLimiter, apiLimiter, paymentLimiter, aiMessageLimiter, aiSessionLimiter, transcribeLimiter, peerRequestLimiter, publicFormLimiter, loginCooldownMiddleware, recordFailedLogin, clearLoginRecord, checkResendLimit };
