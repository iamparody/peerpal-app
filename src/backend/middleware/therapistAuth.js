// Therapist portal authentication. Verifies role = 'therapist' from DB on every request,
// not from the JWT payload alone. Also blocks suspended therapists.
// Therapist accounts are professional-only — no access to any member-facing routes.
const auth = require('./auth');
const { query } = require('../db');

async function therapistAuth(req, res, next) {
  await new Promise((resolve, reject) => {
    auth(req, res, (err) => (err ? reject(err) : resolve()));
  }).catch(() => {});

  if (!req.user) return; // auth middleware already sent 401

  const { rows } = await query(
    `SELECT u.role, tp.suspended, tp.id AS profile_id, tp.user_id
     FROM users u
     JOIN therapist_profiles tp ON tp.user_id = u.id
     WHERE u.id = $1 AND u.is_active = true`,
    [req.user.id]
  );

  if (!rows.length || rows[0].role !== 'therapist') {
    return res.status(403).json({ error: 'Therapist access required', code: 'FORBIDDEN' });
  }

  if (rows[0].suspended) {
    return res.status(403).json({ error: 'Account suspended', code: 'ACCOUNT_SUSPENDED' });
  }

  req.therapist = { profile_id: rows[0].profile_id, user_id: rows[0].user_id };

  next();
}

module.exports = therapistAuth;
