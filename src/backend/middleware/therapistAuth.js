// Therapist portal authentication. Verifies a therapist_profiles row exists for the user,
// not role alone — supports dual-role users (member + therapist same email).
// Also blocks suspended therapists.
const auth = require('./auth');
const { query } = require('../db');

async function therapistAuth(req, res, next) {
  await new Promise((resolve, reject) => {
    auth(req, res, (err) => (err ? reject(err) : resolve()));
  }).catch(() => {});

  if (!req.user) return; // auth middleware already sent 401

  const { rows } = await query(
    `SELECT tp.suspended, tp.id AS profile_id, tp.user_id
     FROM users u
     JOIN therapist_profiles tp ON tp.user_id = u.id
     WHERE u.id = $1 AND u.is_active = true`,
    [req.user.id]
  );

  if (!rows.length) {
    return res.status(403).json({ error: 'Therapist access required', code: 'FORBIDDEN' });
  }

  if (rows[0].suspended) {
    return res.status(403).json({ error: 'Account suspended', code: 'ACCOUNT_SUSPENDED' });
  }

  req.therapist = { profile_id: rows[0].profile_id, user_id: rows[0].user_id };

  next();
}

module.exports = therapistAuth;
