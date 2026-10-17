'use strict';

const { query } = require('../db');
const logger = require('../utils/logger');

const { retryFailedPayout } = require('../utils/therapistPayout');

async function runPayoutRetryJob() {
  const { rows } = await query(
    `SELECT id FROM therapist_payouts
     WHERE status = 'failed'
       AND retry_count <= 1
       AND next_retry_at < NOW()`
  );

  for (const payout of rows) {
    try {
      await retryFailedPayout(payout.id);
      logger.info(`[payoutRetry] Retried payout: ${payout.id}`);
    } catch (err) {
      logger.error('[payoutRetry] Error:', payout.id, err.message);
    }
  }
}

module.exports = { runPayoutRetryJob };
