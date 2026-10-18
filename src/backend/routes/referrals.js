const express = require('express');
const db = require('../db');
const auth = require('../middleware/auth');
const { getReferralStats } = require('../services/referrals');

// Phase 46 referral system. Replaces the Phase 19 therapist-referral route, which was
// unmounted after therapist_referrals was dropped in migration 079.
const router = express.Router();

// ─── GET /referrals/my-stats ──────────────────────────────────────────────────
router.get('/my-stats', auth, async (req, res) => {
  try {
    const stats = await getReferralStats(db, req.user.id);
    if (!stats) return res.status(404).json({ error: 'User not found', code: 'NOT_FOUND' });
    return res.status(200).json(stats);
  } catch (err) {
    console.error('[referrals/my-stats]', err.message);
    return res.status(500).json({ error: 'Could not load referral stats', code: 'REFERRAL_STATS_ERROR' });
  }
});

module.exports = router;
