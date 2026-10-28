'use strict';

const { query } = require('../db');
const logger = require('../utils/logger');

// Closes peer_requests stuck in 'active' for more than 2 hours.
// Guards against lost server-side timers (Render restarts, free-tier sleep)
// that would otherwise permanently block those users from push targets.
async function runStalePeerSessionJob() {
  const { rowCount } = await query(`
    UPDATE peer_requests
    SET status = 'closed', updated_at = NOW()
    WHERE status = 'active'
      AND created_at < NOW() - INTERVAL '2 hours'
  `);
  if (rowCount > 0) {
    logger.info(`[stalePeerSession] Closed ${rowCount} stale active peer session(s)`);
  }
}

module.exports = { runStalePeerSessionJob };
