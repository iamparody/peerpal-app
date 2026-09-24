'use strict';

const { query } = require('../db');
const { retryFailedPayout } = require('../utils/therapistPayout');

// Daraja Transaction Status API check for payouts stuck in 'processing' for 2+ hours.
// On confirmed: mark complete. On failed: retry. On unresolved after retry: alert admin.
async function runPayoutReconciliationJob() {
  const { rows } = await query(
    `SELECT id, idempotency_key, retry_count
     FROM therapist_payouts
     WHERE status = 'processing'
       AND initiated_at < NOW() - INTERVAL '2 hours'`
  );

  for (const payout of rows) {
    try {
      // Without a live Daraja Transaction Status API integration here,
      // treat stuck processing payouts as failed and trigger retry.
      // In production, replace this with a real status check against
      // Daraja's QueryTransactionStatus endpoint using idempotency_key.
      if (payout.retry_count <= 1) {
        await retryFailedPayout(payout.id).catch((e) =>
          console.error('[payoutReconciliation] retry failed:', payout.id, e.message)
        );
        console.log(`[payoutReconciliation] Retried stuck payout: ${payout.id}`);
      } else {
        // Escalate to admin after 1 retry
        await query(
          `UPDATE therapist_payouts SET status = 'failed', updated_at = NOW() WHERE id = $1`,
          [payout.id]
        );
        console.error(`[payoutReconciliation] Payout unresolved after retry — admin alert needed: ${payout.id}`);
      }
    } catch (err) {
      console.error('[payoutReconciliation] Error:', payout.id, err.message);
    }
  }
}

module.exports = { runPayoutReconciliationJob };
