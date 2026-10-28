'use strict';

const { query } = require('../db');
const logger = require('../utils/logger');

// Guards against lost in-process timers (Render restarts, free-tier sleep).
async function runStalePeerSessionJob() {
  // 1. Reset locked requests >5 min old back to open so they can be re-broadcast.
  //    Confidence check is 90s — anything locked longer means the timer was lost.
  const { rowCount: unlocked } = await query(`
    UPDATE peer_requests
    SET status = 'open', accepted_by = NULL, updated_at = NOW()
    WHERE status = 'locked'
      AND updated_at < NOW() - INTERVAL '5 minutes'
  `);

  // 2. Close active peer_requests whose underlying session has already ended.
  //    Primary signal: sessions.ended_at IS NOT NULL (session completed normally but
  //    peer_request status was never updated, e.g. server restart mid-teardown).
  //    Fallback: no session_id recorded and request is >1 hour old (orphaned record).
  //    A genuinely ongoing session always has sessions.ended_at = NULL so is never touched.
  const { rowCount: closedActive } = await query(`
    UPDATE peer_requests pr
    SET status = 'closed', updated_at = NOW()
    WHERE pr.status = 'active'
      AND (
        EXISTS (
          SELECT 1 FROM sessions s
          WHERE s.id = pr.session_id AND s.ended_at IS NOT NULL
        )
        OR (pr.session_id IS NULL AND pr.created_at < NOW() - INTERVAL '1 hour')
      )
  `);

  // 3. Close escalated requests >24 hours old — fallback already sent, admin window passed.
  const { rowCount: closedEscalated } = await query(`
    UPDATE peer_requests
    SET status = 'closed', updated_at = NOW()
    WHERE status = 'escalated'
      AND escalated_at < NOW() - INTERVAL '24 hours'
  `);

  if (unlocked || closedActive || closedEscalated) {
    logger.info(`[stalePeerSession] unlocked=${unlocked} closed_active=${closedActive} closed_escalated=${closedEscalated}`);
  }
}

module.exports = { runStalePeerSessionJob };
