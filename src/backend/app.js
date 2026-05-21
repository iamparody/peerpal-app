require('dotenv').config();
const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const { apiLimiter } = require('./middleware/rateLimit');
const { Sentry } = require('./services/sentry');

const app = express();

// ─── Security & parsing ───────────────────────────────────────────────────────
app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));

// CORS — explicit allowlist; no wildcard in production
const ALLOWED_ORIGINS = process.env.FRONTEND_URL
  ? process.env.FRONTEND_URL.split(',').map((o) => o.trim())
  : ['http://localhost:5173', 'http://localhost:4173', 'http://localhost:5174', 'http://localhost:5175'];

app.use(cors({
  origin: (origin, cb) => {
    // Allow requests with no origin (curl, Postman, same-domain) and listed origins
    if (!origin || ALLOWED_ORIGINS.includes(origin)) return cb(null, true);
    cb(null, false);
  },
  credentials: true,
}));

// Raw body needed for Paystack webhook signature verification
app.use('/api/credits/webhook', express.raw({ type: 'application/json' }));
app.use(express.json());

// ─── General rate limit ───────────────────────────────────────────────────────
app.use('/api', apiLimiter);

// ─── Health check ─────────────────────────────────────────────────────────────
app.get('/health', (_req, res) => res.json({ status: 'ok' }));

// ─── Routes ───────────────────────────────────────────────────────────────────
app.use('/api/auth',          require('./routes/auth'));
app.use('/api/onboarding',    require('./routes/onboarding'));
app.use('/api/moods',         require('./routes/moods'));
app.use('/api/journals',      require('./routes/journals'));
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
app.use('/api/referrals',     require('./routes/referrals'));
app.use('/api/therapists',    require('./routes/therapists'));
app.use('/api/profile',       require('./routes/profile'));
app.use('/api/analytics',     require('./routes/analytics'));

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
