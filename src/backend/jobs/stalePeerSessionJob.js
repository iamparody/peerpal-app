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

  // 2. Close active sessions >1 hour old — sessions are 30 min max.
  const { rowCount: closedActive } = await query(`
    UPDATE peer_requests
    SET status = 'closed', updated_at = NOW()
    WHERE status = 'active'
      AND created_at < NOW() - INTERVAL '1 hour'
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
