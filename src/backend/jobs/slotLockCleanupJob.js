'use strict';

const { query } = require('../db');
const logger = require('../utils/logger');


async function runSlotLockCleanupJob() {
  const { rowCount } = await query(
    'DELETE FROM booking_slot_locks WHERE expires_at < NOW()'
  );
  if (rowCount > 0) {
    logger.info(`[slotLockCleanup] Removed ${rowCount} expired slot lock(s)`);
  }
}

module.exports = { runSlotLockCleanupJob };
