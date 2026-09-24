'use strict';

const { query } = require('../db');

async function runSlotLockCleanupJob() {
  const { rowCount } = await query(
    'DELETE FROM booking_slot_locks WHERE expires_at < NOW()'
  );
  if (rowCount > 0) {
    console.log(`[slotLockCleanup] Removed ${rowCount} expired slot lock(s)`);
  }
}

module.exports = { runSlotLockCleanupJob };
