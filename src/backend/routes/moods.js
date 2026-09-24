const express = require('express');
const { query } = require('../db');
const auth = require('../middleware/auth');
const cache = require('../services/cache');

const router = express.Router();

const VALID_MOOD_LEVELS = ['very_low', 'low', 'neutral', 'good', 'great'];
const VALID_TAGS = ['anxious','hopeful','overwhelmed','calm','lonely','grateful','angry','numb'];
const MILESTONE_DAYS = [3, 7, 30];

// ─── POST /moods ──────────────────────────────────────────────────────────────
router.post('/', auth, async (req, res) => {
  const { mood_level, tags, note } = req.body;

  if (!VALID_MOOD_LEVELS.includes(mood_level)) {
    return res.status(400).json({ error: `mood_level must be one of: ${VALID_MOOD_LEVELS.join(', ')}`, code: 'INVALID_MOOD_LEVEL' });
  }
  if (tags !== undefined && !Array.isArray(tags)) {
    return res.status(400).json({ error: 'tags must be an array', code: 'INVALID_TAGS' });
  }
  if (tags) {
    const invalid = tags.filter((t) => !VALID_TAGS.includes(t));
    if (invalid.length) {
      return res.status(400).json({ error: `Invalid tag(s): ${invalid.join(', ')}`, code: 'INVALID_TAG' });
    }
  }
  if (note && note.length > 200) {
    return res.status(400).json({ error: 'note must be 200 characters or fewer', code: 'NOTE_TOO_LONG' });
  }

  const { rows: moodRows } = await query(
    'INSERT INTO moods (user_id, mood_level, tags, note) VALUES ($1, $2, $3, $4) RETURNING id',
    [req.user.id, mood_level, tags || null, note || null]
  );
  const moodId = moodRows[0].id;

  // ── Streak logic ──────────────────────────────────────────────────────────
  const { rows: userRows } = await query(
    'SELECT streak_count, last_checkin_at, signup_bonus_credited FROM users WHERE id = $1',
    [req.user.id]
  );
  const user = userRows[0];

  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);

  let newStreak = user.streak_count;
  let bonusCredited = false;

  const lastCheckin = user.last_checkin_at ? new Date(user.last_checkin_at) : null;
  const alreadyCheckedInToday = lastCheckin && lastCheckin >= todayStart;

  if (!alreadyCheckedInToday) {
    const yesterday = new Date(todayStart);
    yesterday.setDate(yesterday.getDate() - 1);
    const streakContinues = lastCheckin && lastCheckin >= yesterday;
    newStreak = streakContinues ? user.streak_count + 1 : 1;

    await query(
      'UPDATE users SET streak_count = $1, last_checkin_at = NOW(), updated_at = NOW() WHERE id = $2',
      [newStreak, req.user.id]
    );

    // Milestone notifications
    if (MILESTONE_DAYS.includes(newStreak)) {
      await query(
        `INSERT INTO notifications (user_id, type, payload, channel)
         VALUES ($1, 'milestone', $2, 'in_app')`,
        [req.user.id, JSON.stringify({ streak: newStreak })]
      );
    }
  }

  // ── Signup bonus (first mood entry only) ─────────────────────────────────
  if (!user.signup_bonus_credited) {
    await query('UPDATE credits SET balance = balance + 2, updated_at = NOW() WHERE user_id = $1', [req.user.id]);
    await query(
      `INSERT INTO credit_transactions (user_id, type, amount_credits, payment_method, channel, status)
       VALUES ($1, 'bonus', 2, 'bonus', 'purchase', 'confirmed')`,
      [req.user.id]
    );
    await query(
      'UPDATE users SET signup_bonus_credited = true, updated_at = NOW() WHERE id = $1',
      [req.user.id]
    );
    bonusCredited = true;
  }

  // ── Low-mood therapy nudge ────────────────────────────────────────────────
  if (mood_level === 'very_low') {
    try {
      const { rows: activeBookings } = await query(
        `SELECT id FROM therapist_bookings WHERE member_user_id = $1 AND status IN ('pending','confirmed','paid') LIMIT 1`,
        [req.user.id]
      );
      if (activeBookings.length === 0) {
        const { rows: nudgeRows } = await query(
          `SELECT last_therapy_nudge_at FROM users WHERE id = $1`,
          [req.user.id]
        );
        const lastNudge = nudgeRows[0]?.last_therapy_nudge_at;
        const nudgeStale = !lastNudge || (Date.now() - new Date(lastNudge).getTime()) > 7 * 24 * 3600 * 1000;
        if (nudgeStale) {
          await query(
            `INSERT INTO notifications (user_id, type, payload, channel)
             VALUES ($1, 'therapist_nudge', $2, 'in_app')`,
            [req.user.id, JSON.stringify({ message: 'Talking to a professional can help. A verified therapist is available now.', action: '/therapists' })]
          );
          await query(
            `UPDATE users SET last_therapy_nudge_at = NOW(), updated_at = NOW() WHERE id = $1`,
            [req.user.id]
          );
        }
      }
    } catch (nudgeErr) {
      console.error('[moods] nudge error:', nudgeErr.message);
    }
  }

  await cache.del(`analytics:${req.user.id}`);
  return res.status(201).json({ mood_id: moodId, streak_count: newStreak, bonus_credited: bonusCredited });
});

// ─── GET /moods/today ─────────────────────────────────────────────────────────
router.get('/today', auth, async (req, res) => {
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);

  const { rows } = await query(
    'SELECT * FROM moods WHERE user_id = $1 AND created_at >= $2 ORDER BY created_at DESC LIMIT 1',
    [req.user.id, todayStart]
  );

  return res.status(200).json({ entry: rows[0] || null });
});

// ─── GET /moods/analytics ─────────────────────────────────────────────────────
// ?period=7d|30d|90d|all  (default 7d)
// Returns trend array, common_mood, frequent_tags for the selected period.
// Also returns account_start_date so the frontend knows how far back data goes.
router.get('/analytics', auth, async (req, res) => {
  const VALID_PERIODS = ['7d', '30d', '90d', 'all'];
  const period = VALID_PERIODS.includes(req.query.period) ? req.query.period : '7d';
  const cacheKey = `analytics:${req.user.id}:${period}`;
  const cached = await cache.get(cacheKey);
  if (cached) return res.status(200).json(cached);

  const LEVEL_SCORE = { very_low: -2, low: -1, neutral: 0, good: 1, great: 2 };

  // Fetch user metadata — streak, total, account start anchor
  const { rows: userRows } = await query(
    'SELECT streak_count, created_at, last_data_deletion_at FROM users WHERE id = $1',
    [req.user.id]
  );
  const userMeta = userRows[0];
  const accountStartDate = userMeta.last_data_deletion_at
    ? new Date(Math.max(new Date(userMeta.created_at), new Date(userMeta.last_data_deletion_at)))
    : new Date(userMeta.created_at);

  // Determine query window
  let windowStart;
  if (period === '7d')  windowStart = new Date(Date.now() - 7  * 24 * 60 * 60 * 1000);
  if (period === '30d') windowStart = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  if (period === '90d') windowStart = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
  if (period === 'all') windowStart = accountStartDate;

  const { rows: entries } = await query(
    `SELECT mood_level, tags, created_at
     FROM moods WHERE user_id = $1 AND created_at >= $2
     ORDER BY created_at ASC`,
    [req.user.id, windowStart]
  );

  // Build trend array
  // 7d/30d → daily buckets; 90d → weekly buckets; all → monthly buckets
  let trend = [];
  if (period === '7d' || period === '30d') {
    const days = period === '7d' ? 7 : 30;
    for (let i = days - 1; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const dateStr = d.toISOString().slice(0, 10);
      const dayEntries = entries.filter((e) => e.created_at.toISOString().slice(0, 10) === dateStr);
      const avg = dayEntries.length
        ? dayEntries.reduce((s, e) => s + LEVEL_SCORE[e.mood_level], 0) / dayEntries.length
        : null;
      trend.push({ date: dateStr, avg_score: avg, count: dayEntries.length });
    }
  } else if (period === '90d') {
    // 13 weekly buckets — label is Monday of each week
    for (let w = 12; w >= 0; w--) {
      const weekEnd = new Date();
      weekEnd.setDate(weekEnd.getDate() - w * 7);
      const weekStart = new Date(weekEnd);
      weekStart.setDate(weekEnd.getDate() - 6);
      weekStart.setHours(0, 0, 0, 0);
      weekEnd.setHours(23, 59, 59, 999);
      const weekEntries = entries.filter((e) => {
        const t = new Date(e.created_at);
        return t >= weekStart && t <= weekEnd;
      });
      const avg = weekEntries.length
        ? weekEntries.reduce((s, e) => s + LEVEL_SCORE[e.mood_level], 0) / weekEntries.length
        : null;
      trend.push({ date: weekStart.toISOString().slice(0, 10), avg_score: avg, count: weekEntries.length, granularity: 'week' });
    }
  } else {
    // all — monthly buckets from account start to now
    const now = new Date();
    const cursor = new Date(accountStartDate);
    cursor.setDate(1);
    cursor.setHours(0, 0, 0, 0);
    while (cursor <= now) {
      const monthStart = new Date(cursor);
      const monthEnd = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0, 23, 59, 59, 999);
      const monthEntries = entries.filter((e) => {
        const t = new Date(e.created_at);
        return t >= monthStart && t <= monthEnd;
      });
      const avg = monthEntries.length
        ? monthEntries.reduce((s, e) => s + LEVEL_SCORE[e.mood_level], 0) / monthEntries.length
        : null;
      trend.push({
        date: cursor.toISOString().slice(0, 10),
        avg_score: avg,
        count: monthEntries.length,
        label: cursor.toLocaleDateString('en-KE', { month: 'short', year: '2-digit' }),
        granularity: 'month',
      });
      cursor.setMonth(cursor.getMonth() + 1);
    }
  }

  // Most common mood for the period
  const moodCounts = {};
  for (const e of entries) moodCounts[e.mood_level] = (moodCounts[e.mood_level] || 0) + 1;
  const common_mood = Object.keys(moodCounts).sort((a, b) => moodCounts[b] - moodCounts[a])[0] || null;

  // Most frequent tags for the period
  const tagCounts = {};
  for (const e of entries) {
    if (e.tags) for (const tag of e.tags) tagCounts[tag] = (tagCounts[tag] || 0) + 1;
  }
  const frequent_tags = Object.entries(tagCounts)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 8)
    .map(([tag, count]) => ({ tag, count }));

  const { rows: totalRows } = await query('SELECT COUNT(*) FROM moods WHERE user_id = $1', [req.user.id]);

  // Keep week_trend alias so existing callers (DashboardScreen) don't break
  const result = {
    week_trend: period === '7d' ? trend : undefined,
    trend,
    period,
    common_mood,
    frequent_tags,
    current_streak: userMeta.streak_count || 0,
    total_checkins: parseInt(totalRows[0].count),
    account_start_date: accountStartDate.toISOString().slice(0, 10),
  };
  await cache.set(cacheKey, result, 300);
  return res.status(200).json(result);
});

// ─── GET /moods/arc ───────────────────────────────────────────────────────────
// All of today's mood entries in chronological order — powers the daily arc view.
router.get('/arc', auth, async (req, res) => {
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);

  const { rows } = await query(
    'SELECT id, mood_level, tags, note, created_at FROM moods WHERE user_id = $1 AND created_at >= $2 ORDER BY created_at ASC',
    [req.user.id, todayStart]
  );

  return res.status(200).json({ entries: rows });
});

// ─── GET /moods/history ───────────────────────────────────────────────────────
// Limit raised to 500 to support full-history dot grid rendering.
router.get('/history', auth, async (req, res) => {
  const page = Math.max(1, parseInt(req.query.page) || 1);
  const limit = Math.min(500, Math.max(1, parseInt(req.query.limit) || 20));
  const offset = (page - 1) * limit;

  const conditions = ['user_id = $1'];
  const params = [req.user.id];
  let idx = 2;

  if (req.query.from_date) { conditions.push(`created_at >= $${idx++}`); params.push(req.query.from_date); }
  if (req.query.to_date)   { conditions.push(`created_at <= $${idx++}`); params.push(req.query.to_date); }

  const where = conditions.join(' AND ');
  const { rows } = await query(
    `SELECT * FROM moods WHERE ${where} ORDER BY created_at DESC LIMIT $${idx++} OFFSET $${idx}`,
    [...params, limit, offset]
  );
  const { rows: countRows } = await query(`SELECT COUNT(*) FROM moods WHERE ${where}`, params);
  const total = parseInt(countRows[0].count);

  return res.status(200).json({ entries: rows, total, page, pages: Math.ceil(total / limit) });
});

// ─── GET /moods/day ───────────────────────────────────────────────────────────
// ?date=YYYY-MM-DD — returns all mood entries + journal entries for that calendar date.
// Journals returned with full content (not preview) for reflection use.
router.get('/day', auth, async (req, res) => {
  const { date } = req.query;
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return res.status(400).json({ error: 'date is required (YYYY-MM-DD)', code: 'INVALID_DATE' });
  }

  const dayStart = `${date}T00:00:00.000Z`;
  const dayEnd   = `${date}T23:59:59.999Z`;

  const [moodsResult, journalsResult] = await Promise.all([
    query(
      `SELECT id, mood_level, tags, note, created_at
       FROM moods WHERE user_id = $1 AND created_at >= $2 AND created_at <= $3
       ORDER BY created_at ASC`,
      [req.user.id, dayStart, dayEnd]
    ),
    query(
      `SELECT id, content, mood_level, tags, created_at
       FROM journals WHERE user_id = $1 AND created_at >= $2 AND created_at <= $3
       ORDER BY created_at ASC`,
      [req.user.id, dayStart, dayEnd]
    ),
  ]);

  return res.status(200).json({
    date,
    moods:    moodsResult.rows,
    journals: journalsResult.rows,
  });
});

module.exports = router;
