'use strict';

const { query } = require('../db');

// Segment thresholds (spec Section: Segment thresholds)
const SEGMENTS = [
  { name: 'healthy', min: 70 },
  { name: 'cooling', min: 40 },
  { name: 'at_risk', min: 15 },
  { name: 'dormant', min: 0  },
];

function scoreToSegment(score) {
  for (const s of SEGMENTS) {
    if (score >= s.min) return s.name;
  }
  return 'dormant';
}

// Pure scoring — takes raw metrics, returns { score, segment }.
// Exported for unit testing without DB.
function computeScoreFromMetrics({ days_inactive, activity_count_30d, distinct_features, active_days_last_90d }) {
  const recency_pts   = Math.max(0, 40 - days_inactive * 3);
  const frequency_pts = Math.min(30, activity_count_30d * 3);
  const breadth_pts   = Math.min(20, distinct_features * 5);
  const history_pts   = Math.min(10, active_days_last_90d / 3);
  const score         = Math.round(recency_pts + frequency_pts + breadth_pts + history_pts);
  return { score, segment: scoreToSegment(score) };
}

// Fetches metrics for a user and returns { score, segment }.
async function computeEngagementScore(userId) {
  // Days since last activity of any type
  const { rows: lastActivity } = await query(
    `SELECT GREATEST(
       COALESCE(MAX(m.created_at),  '1970-01-01'),
       COALESCE(MAX(ai.created_at), '1970-01-01'),
       COALESCE(MAX(s.started_at),  '1970-01-01'),
       COALESCE(MAX(j.created_at),  '1970-01-01')
     ) AS last_at
     FROM users u
     LEFT JOIN moods           m  ON m.user_id  = u.id
     LEFT JOIN ai_interactions ai ON ai.user_id = u.id
     LEFT JOIN sessions        s  ON s.user_id  = u.id
     LEFT JOIN journals        j  ON j.user_id  = u.id
     WHERE u.id = $1`,
    [userId]
  );
  const lastAt       = lastActivity[0]?.last_at;
  const days_inactive = lastAt
    ? Math.max(0, (Date.now() - new Date(lastAt).getTime()) / 86400000)
    : 9999;

  // Activity count in last 30 days
  const { rows: freq } = await query(
    `SELECT
       (SELECT COUNT(*) FROM moods           WHERE user_id = $1 AND created_at  > NOW() - INTERVAL '30 days') +
       (SELECT COUNT(*) FROM ai_interactions WHERE user_id = $1 AND created_at  > NOW() - INTERVAL '30 days') +
       (SELECT COUNT(*) FROM sessions        WHERE user_id = $1 AND started_at  > NOW() - INTERVAL '30 days') +
       (SELECT COUNT(*) FROM journals        WHERE user_id = $1 AND created_at  > NOW() - INTERVAL '30 days')
     AS total`,
    [userId]
  );
  const activity_count_30d = parseInt(freq[0]?.total ?? 0, 10);

  // Distinct features used ever (AI, peer, journal, therapy) — max 4
  const { rows: features } = await query(
    `SELECT
       (CASE WHEN EXISTS (SELECT 1 FROM ai_interactions    WHERE user_id = $1) THEN 1 ELSE 0 END) +
       (CASE WHEN EXISTS (SELECT 1 FROM sessions           WHERE user_id = $1) THEN 1 ELSE 0 END) +
       (CASE WHEN EXISTS (SELECT 1 FROM journals           WHERE user_id = $1) THEN 1 ELSE 0 END) +
       (CASE WHEN EXISTS (SELECT 1 FROM therapist_bookings WHERE member_user_id = $1) THEN 1 ELSE 0 END)
     AS cnt`,
    [userId]
  );
  const distinct_features = parseInt(features[0]?.cnt ?? 0, 10);

  // Active days in last 90 days (distinct calendar days with any activity)
  const { rows: history } = await query(
    `SELECT COUNT(DISTINCT day) AS cnt FROM (
       SELECT DATE(created_at)  AS day FROM moods           WHERE user_id = $1 AND created_at  > NOW() - INTERVAL '90 days'
       UNION ALL
       SELECT DATE(created_at)  AS day FROM ai_interactions WHERE user_id = $1 AND created_at  > NOW() - INTERVAL '90 days'
       UNION ALL
       SELECT DATE(started_at)  AS day FROM sessions        WHERE user_id = $1 AND started_at  > NOW() - INTERVAL '90 days'
       UNION ALL
       SELECT DATE(created_at)  AS day FROM journals        WHERE user_id = $1 AND created_at  > NOW() - INTERVAL '90 days'
     ) t`,
    [userId]
  );
  const active_days_last_90d = parseInt(history[0]?.cnt ?? 0, 10);

  return computeScoreFromMetrics({ days_inactive, activity_count_30d, distinct_features, active_days_last_90d });
}

// Updates engagement_score and engagement_segment for all active members.
// Called from the nightly job — runs silently alongside nudge logic.
async function updateEngagementSegments() {
  const { rows: users } = await query(
    `SELECT id FROM users WHERE is_active = true AND role = 'member'`
  );

  let updated = 0;
  for (const { id } of users) {
    try {
      const { score, segment } = await computeEngagementScore(id);
      await query(
        `UPDATE users SET engagement_score = $1, engagement_segment = $2 WHERE id = $3`,
        [score, segment, id]
      );
      updated++;
    } catch (err) {
      console.error(`[engagementScore] failed for user ${id}:`, err.message);
    }
  }

  console.log(`[engagementScore] Updated ${updated}/${users.length} users`);
}

module.exports = { computeEngagementScore, computeScoreFromMetrics, updateEngagementSegments, scoreToSegment };
