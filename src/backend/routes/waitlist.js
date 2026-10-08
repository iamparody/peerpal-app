const express = require('express');
const crypto = require('crypto');
const rateLimit = require('express-rate-limit');
const { query } = require('../db');
const adminAuth = require('../middleware/adminAuth');
const { deliverEmail } = require('../services/emailService');

const router = express.Router();

// A visitor only needs to sign up once. Tight limiter guards against spam/abuse
// on top of the general /api ceiling.
const waitlistLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many attempts — please try again shortly', code: 'RATE_LIMITED' },
});

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const ALLOWED_SOURCES = new Set(['landing', 'hero', 'footer']);
const NOTIFY_EMAIL = process.env.WAITLIST_NOTIFY_EMAIL || 'support@peer-pal.com';

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}

// Non-reversible IP fingerprint — lets us spot abuse without storing raw IPs (PII).
function hashIp(ip) {
  if (!ip) return null;
  const salt = process.env.WAITLIST_IP_SALT || 'peerpal-waitlist';
  return crypto.createHash('sha256').update(salt + ip).digest('hex');
}

function confirmationHtml() {
  return `
    <div style="font-family:Inter,Arial,sans-serif;max-width:520px;margin:0 auto;color:#2f2622">
      <h1 style="font-family:Georgia,'Times New Roman',serif;font-weight:500;font-size:26px;margin:0 0 12px">
        You're on the PeerPal waitlist.
      </h1>
      <p style="font-size:15px;line-height:1.7;color:#5c5048;margin:0 0 16px">
        Thanks for signing up. We're opening access gradually — we'll email you the moment it's your turn.
        Nothing else, and you can leave anytime.
      </p>
      <p style="font-size:13px;line-height:1.6;color:#8a7d73;margin:24px 0 0">
        PeerPal is a peer-support and digital-wellness platform for adults 18+, not a medical service.
        If you're in immediate danger, contact local emergency services or Befrienders Kenya on 0800 723 253.
      </p>
    </div>`;
}

// ─── POST /waitlist ───────────────────────────────────────────────────────────
// Public, no auth. Stores a pre-launch email signup. Idempotent per email.
router.post('/', waitlistLimiter, async (req, res) => {
  const emailRaw = typeof req.body.email === 'string' ? req.body.email.trim() : '';
  const email = emailRaw.toLowerCase();
  const source = ALLOWED_SOURCES.has(req.body.source) ? req.body.source : 'landing';

  if (!EMAIL_RE.test(email) || email.length > 254) {
    return res.status(400).json({ error: 'Please enter a valid email address', code: 'INVALID_EMAIL' });
  }

  try {
    const userAgent = (req.headers['user-agent'] || '').slice(0, 300) || null;
    const { rows } = await query(
      `INSERT INTO waitlist_signups (email, source, user_agent, ip_hash)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (LOWER(email)) DO NOTHING
       RETURNING id`,
      [email, source, userAgent, hashIp(req.ip)]
    );

    const alreadyJoined = rows.length === 0;

    if (!alreadyJoined && process.env.RESEND_API_KEY && process.env.EMAIL_FROM) {
      // Best-effort confirmation to the new signup — never blocks or fails the signup.
      deliverEmail(email, "You're on the PeerPal waitlist", confirmationHtml())
        .catch((e) => console.warn('[waitlist] confirmation email failed:', e.message));

      // Best-effort instant notification to the team.
      deliverEmail(
        NOTIFY_EMAIL,
        'New PeerPal waitlist signup',
        `<p style="font-family:Inter,Arial,sans-serif;font-size:15px;color:#2f2622">
           New waitlist signup: <strong>${escapeHtml(email)}</strong> (source: ${escapeHtml(source)}).
         </p>`
      ).catch((e) => console.warn('[waitlist] notify email failed:', e.message));
    }

    return res.status(alreadyJoined ? 200 : 201).json({ status: 'ok', already: alreadyJoined });
  } catch (err) {
    console.error('[waitlist] insert failed:', err.message);
    return res.status(500).json({ error: 'Something went wrong. Please try again.', code: 'SERVER_ERROR' });
  }
});

// ─── GET /waitlist ────────────────────────────────────────────────────────────
// Admin only. Returns the total count + recent signups, or ?format=csv to export.
router.get('/', adminAuth, async (req, res) => {
  const { rows: countRows } = await query('SELECT COUNT(*)::int AS total FROM waitlist_signups');
  const total = countRows[0].total;

  if (req.query.format === 'csv') {
    const { rows } = await query(
      'SELECT email, source, created_at FROM waitlist_signups ORDER BY created_at DESC'
    );
    const header = 'email,source,created_at\n';
    const body = rows
      .map((r) => `${r.email},${r.source},${r.created_at.toISOString()}`)
      .join('\n');
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="waitlist.csv"');
    return res.send(header + body);
  }

  const limit = Math.min(parseInt(req.query.limit, 10) || 100, 500);
  const { rows: recent } = await query(
    `SELECT id, email, source, invited_at, created_at
       FROM waitlist_signups
      ORDER BY created_at DESC
      LIMIT $1`,
    [limit]
  );
  return res.json({ total, count: recent.length, signups: recent });
});

module.exports = router;
