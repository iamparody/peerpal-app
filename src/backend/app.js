require('dotenv').config();
const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const { apiLimiter } = require('./middleware/rateLimit');
const { Sentry } = require('./services/sentry');

const app = express();

// Trust Render/Vercel reverse proxy so rate limiter can read real client IP
app.set('trust proxy', 1);

// ─── Security & parsing ───────────────────────────────────────────────────────
app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));

// CORS — explicit allowlist + Vercel preview subdomains
const ALLOWED_ORIGINS = process.env.FRONTEND_URL
  ? process.env.FRONTEND_URL.split(',').map((o) => o.trim())
  : ['http://localhost:5173', 'http://localhost:4173', 'http://localhost:5174', 'http://localhost:5175', 'http://localhost:5176'];

const VERCEL_PREVIEW_RE = /^https:\/\/[a-z0-9-]+-iamparodys-projects\.vercel\.app$/;
const THERAPIST_PORTAL = 'https://tportal-one.vercel.app';

app.use(cors({
  origin: (origin, cb) => {
    if (!origin) return cb(null, true);
    if (ALLOWED_ORIGINS.includes(origin)) return cb(null, true);
    if (origin === THERAPIST_PORTAL) return cb(null, true);
    if (VERCEL_PREVIEW_RE.test(origin)) return cb(null, true);
    cb(null, false);
  },
  credentials: true,
}));

// Daraja M-Pesa callback — parsed JSON, no raw body needed (Paystack removed)
app.use(express.json());

// ─── General rate limit ───────────────────────────────────────────────────────
app.use('/api', apiLimiter);

// ─── Health check ─────────────────────────────────────────────────────────────
app.get('/health', async (_req, res) => {
  try {
    const { query } = require('./db');
    await query('SELECT 1');
    res.json({ status: 'ok', db: 'ok' });
  } catch (err) {
    res.status(503).json({ status: 'ok', db: 'error', detail: err.message });
  }
});

// ─── Routes ───────────────────────────────────────────────────────────────────
app.use('/api/auth',          require('./routes/auth'));
app.use('/api/onboarding',    require('./routes/onboarding'));
app.use('/api/moods',         require('./routes/moods'));
app.use('/api/journals',      require('./routes/journals'));
app.use('/api/vents',         require('./routes/vents'));
app.use('/api/ai',            require('./routes/ai'));
app.use('/api/credits',       require('./routes/credits'));
app.use('/api/peer',          require('./routes/peer'));
app.use('/api/groups',        require('./routes/groups'));
app.use('/api/admin',         require('./routes/admin'));
app.use('/api/emergency',     require('./routes/emergency'));
app.use('/api/safety-plan',   require('./routes/safetyPlan'));
app.use('/api/notifications', require('./routes/notifications'));
app.use('/api/feedback',      require('./routes/feedback'));
app.use('/api/resources',     require('./routes/resources'));
app.use('/api/therapists',    require('./routes/therapists'));
app.use('/api/therapy',       require('./routes/therapy'));
app.use('/api/profile',       require('./routes/profile'));
app.use('/api/analytics',     require('./routes/analytics'));
app.use('/api/training',      require('./routes/training'));
app.use('/api/policy',        require('./routes/policy'));

// ─── Sentry error handler (must be before custom error handler) ───────────────
if (process.env.SENTRY_DSN) {
  app.use(Sentry.expressErrorHandler());
}

// ─── Global error handler ─────────────────────────────────────────────────────
// eslint-disable-next-line no-unused-vars
app.use((err, _req, res, _next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({ error: 'Internal server error', code: 'SERVER_ERROR' });
});

module.exports = app;
