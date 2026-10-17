// Phase 46 referral system (CHECKLIST.md Phase 46).
//
//  signup with a valid code → referred user +1 bonus credit, referral_rewards row 'pending'
//  referred user's first confirmed purchase → referrer +2 credits, row 'credited', notification
//
// The 'pending' → 'credited' UPDATE is the idempotency guard: a reward can only be paid once,
// even when the payment webhook fires twice. Because the pending row is created at signup,
// the first purchase that lands while it is pending IS the user's first purchase; a reward
// that failed to credit on the first purchase is retried on the next one rather than lost.
//
// The referrer is never told who the friend is. Aliases are anonymous; a referrer who knows
// the friend in real life could otherwise recognise them in groups and peer sessions.

const { normalizeReferralCode, generateReferralCode } = require('../utils/referralCode');

const SIGNUP_BONUS_CREDITS = 1;
const REFERRER_REWARD_CREDITS = 2;
const REWARD_TRIGGER = 'first_purchase';

function rewardMessage(credits) {
  return `A friend you invited made their first top-up. You've earned ${credits} credits.`;
}

// tx: transaction client. Unknown, inactive or malformed codes are ignored (never block signup).
// Returns { applied, reason?, referrer_user_id? }.
async function applyReferralAtSignup(tx, newUserId, rawCode) {
  const code = normalizeReferralCode(rawCode);
  if (!code) return { applied: false, reason: 'invalid_code' };

  const { rows: owners } = await tx.query(
    'SELECT id FROM users WHERE referral_code = $1 AND is_active = true AND id <> $2',
    [code, newUserId]
  );
  if (!owners.length) return { applied: false, reason: 'unknown_code' };
  const referrerId = owners[0].id;

  const { rowCount: linked } = await tx.query(
    'UPDATE users SET referred_by = $1 WHERE id = $2 AND referred_by IS NULL',
    [referrerId, newUserId]
  );
  if (!linked) return { applied: false, reason: 'already_referred' };

  const { rowCount } = await tx.query(
    'UPDATE credits SET balance = balance + $1, updated_at = NOW() WHERE user_id = $2',
    [SIGNUP_BONUS_CREDITS, newUserId]
  );
  if (!rowCount) throw new Error('credits row missing for referred user');

  await tx.query(
    `INSERT INTO credit_transactions (user_id, amount_credits, type, payment_method, channel, status)
     VALUES ($1, $2, 'bonus', 'bonus', 'referral', 'confirmed')`,
    [newUserId, SIGNUP_BONUS_CREDITS]
  );

  await tx.query(
    `INSERT INTO referral_rewards (referrer_user_id, referred_user_id, credits_awarded, triggered_by)
     VALUES ($1, $2, $3, $4)`,
    [referrerId, newUserId, REFERRER_REWARD_CREDITS, REWARD_TRIGGER]
  );

  return { applied: true, referrer_user_id: referrerId };
}

// tx: transaction client. Pays the pending reward for `referredUserId`, if any.
// Returns { credited, referrer_user_id?, credits_awarded?, payload? }.
async function creditReferralReward(tx, referredUserId) {
  const { rows } = await tx.query(
    `UPDATE referral_rewards SET status = 'credited', credited_at = NOW()
     WHERE referred_user_id = $1 AND status = 'pending'
     RETURNING id, referrer_user_id, credits_awarded`,
    [referredUserId]
  );
  if (!rows.length) return { credited: false };
  const { referrer_user_id, credits_awarded } = rows[0];

  const { rowCount } = await tx.query(
    'UPDATE credits SET balance = balance + $1, updated_at = NOW() WHERE user_id = $2',
    [credits_awarded, referrer_user_id]
  );
  if (!rowCount) throw new Error('credits row missing for referrer');

  await tx.query(
    `INSERT INTO credit_transactions (user_id, amount_credits, type, payment_method, channel, status)
     VALUES ($1, $2, 'referral_reward', 'bonus', 'referral', 'confirmed')`,
    [referrer_user_id, credits_awarded]
  );

  const payload = { message: rewardMessage(credits_awarded), credits_awarded };
  await tx.query(
    `INSERT INTO notifications (user_id, type, payload, channel)
     VALUES ($1, 'referral_reward_credited', $2, 'in_app')`,
    [referrer_user_id, JSON.stringify(payload)]
  );

  return { credited: true, referrer_user_id, credits_awarded, payload };
}

// Called from the payment webhook after a purchase is confirmed. Never throws: the purchase
// has already succeeded, a reward failure is logged and retried on the user's next purchase.
async function rewardReferrerOnPurchase(userId) {
  const { transaction, query } = require('../db');
  const cache = require('./cache');
  const { enqueuePushNotification } = require('../utils/fcm');
  try {
    const result = await transaction((tx) => creditReferralReward(tx, userId));
    if (!result.credited) return result;

    console.log('[referral] reward credited', { referrer: result.referrer_user_id, credits: result.credits_awarded });
    await cache.del(`credits:${result.referrer_user_id}`).catch(() => {});

    const { rows } = await query('SELECT fcm_token FROM users WHERE id = $1', [result.referrer_user_id]);
    if (rows[0]?.fcm_token) {
      await enqueuePushNotification(rows[0].fcm_token, 'referral_reward_credited', '', {
        type: 'referral_reward_credited',
        credits_awarded: String(result.credits_awarded),
      });
    }
    return result;
  } catch (err) {
    console.error('[referral] reward failed (purchase unaffected)', { user: userId, error: err.message });
    return { credited: false, error: err.message };
  }
}

// db: pool module or client. Pre-108 accounts get their code generated on first view.
async function getReferralStats(db, userId) {
  const { rows } = await db.query('SELECT referral_code FROM users WHERE id = $1', [userId]);
  if (!rows.length) return null;
  let code = rows[0].referral_code;

  if (!code) {
    const candidate = await generateReferralCode(db);
    const { rows: set } = await db.query(
      'UPDATE users SET referral_code = $1 WHERE id = $2 AND referral_code IS NULL RETURNING referral_code',
      [candidate, userId]
    );
    if (set.length) {
      code = set[0].referral_code;
    } else {
      // A concurrent request set it first.
      const { rows: again } = await db.query('SELECT referral_code FROM users WHERE id = $1', [userId]);
      code = again[0]?.referral_code ?? null;
    }
  }

  const { rows: stats } = await db.query(
    `SELECT COUNT(*)::int                                                          AS total_referred,
            COALESCE(SUM(credits_awarded) FILTER (WHERE status = 'credited'), 0)::int AS total_credits_earned,
            COUNT(*) FILTER (WHERE status = 'pending')::int                         AS pending_count
     FROM referral_rewards WHERE referrer_user_id = $1`,
    [userId]
  );

  return {
    referral_code: code,
    total_referred: stats[0].total_referred,
    total_credits_earned: stats[0].total_credits_earned,
    pending_count: stats[0].pending_count,
  };
}

module.exports = {
  applyReferralAtSignup,
  creditReferralReward,
  rewardReferrerOnPurchase,
  getReferralStats,
  rewardMessage,
  SIGNUP_BONUS_CREDITS,
  REFERRER_REWARD_CREDITS,
};
