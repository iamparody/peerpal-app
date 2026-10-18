const { query, transaction } = require('../db');
const logger = require('../utils/logger');
const { getFcmBreaker, getEmailBreaker } = require('../utils/breakers');

// Exponential backoff: attempt 1 = 5 min, 2 = 30 min, 3 = 2 hr
const BACKOFF_MINUTES = [5, 30, 120];
const BATCH_SIZE = 20;
// Rows stuck in 'processing' longer than this are from a crashed run and safe to reset
const STUCK_PROCESSING_MINUTES = 30;

async function runDlqRetryJob() {
  // Recover rows left in 'processing' by a previously crashed run
  await query(
    `UPDATE dlq_jobs SET status = 'pending', updated_at = NOW()
     WHERE status = 'processing'
       AND updated_at < NOW() - ($1 * interval '1 minute')`,
    [STUCK_PROCESSING_MINUTES]
  ).catch(err => logger.error({ err }, 'dlqRetryJob: failed to reset stuck processing rows'));

  // Claim a batch atomically: SELECT FOR UPDATE SKIP LOCKED + mark processing
  // inside a short transaction so concurrent cron ticks can't double-process.
  let rows;
  try {
    rows = await transaction(async (client) => {
      const { rows: selected } = await client.query(
        `SELECT id, job_type, payload, attempts, max_attempts
         FROM dlq_jobs
         WHERE status = 'pending' AND next_retry_at <= NOW()
         ORDER BY next_retry_at ASC
         LIMIT $1
         FOR UPDATE SKIP LOCKED`,
        [BATCH_SIZE]
      );
      if (!selected.length) return [];
      const ids = selected.map(r => r.id);
      await client.query(
        `UPDATE dlq_jobs SET status = 'processing', updated_at = NOW()
         WHERE id = ANY($1::bigint[])`,
        [ids]
      );
      return selected;
    });
  } catch (err) {
    logger.error({ err }, 'dlqRetryJob: failed to claim batch');
    return;
  }

  if (!rows.length) return;

  logger.info({ count: rows.length }, 'dlqRetryJob: processing batch');

  for (const job of rows) {
    const { id, job_type, payload, attempts, max_attempts } = job;

    try {
      if (job_type === 'push') {
        await getFcmBreaker().fire(payload.fcm_token, payload.title, payload.body, payload.data || {});
      } else if (job_type === 'email') {
        await getEmailBreaker().fire(payload.to, payload.subject, payload.html);
      } else {
        throw new Error(`Unknown job_type: ${job_type}`);
      }

      await query(
        `UPDATE dlq_jobs SET status = 'succeeded', updated_at = NOW(),
         last_attempted_at = NOW(), attempts = attempts + 1 WHERE id = $1`,
        [id]
      );
      logger.info({ dlq_id: id, job_type }, 'dlqRetryJob: job succeeded');
    } catch (err) {
      const newAttempts = attempts + 1;
      const isDead = newAttempts >= max_attempts;
      const backoffSecs = (BACKOFF_MINUTES[newAttempts - 1] || 120) * 60;

      try {
        await query(
          `UPDATE dlq_jobs
           SET status = $1,
               attempts = $2,
               last_attempted_at = NOW(),
               next_retry_at = NOW() + ($3 * interval '1 second'),
               error_message = $4,
               updated_at = NOW()
           WHERE id = $5`,
          [isDead ? 'dead' : 'pending', newAttempts, backoffSecs, err.message, id]
        );
      } catch (updateErr) {
        // Row stays 'processing' but will be reset on the next run by the recovery step above
        logger.error({ err: updateErr, dlq_id: id }, 'dlqRetryJob: failed to update row after delivery failure');
      }

      logger.warn({ dlq_id: id, job_type, attempt: newAttempts, dead: isDead, err }, 'dlqRetryJob: job failed');
    }
  }
}

// Write a failed job to the DLQ. Called from worker failed handlers.
async function enqueueDlq(job_type, payload, errorMessage) {
  try {
    await query(
      `INSERT INTO dlq_jobs (job_type, payload, error_message)
       VALUES ($1, $2, $3)`,
      [job_type, JSON.stringify(payload), errorMessage || null]
    );
  } catch (err) {
    logger.error({ err, job_type }, 'dlqRetryJob: failed to write to DLQ');
  }
}

function isFinalAttempt(job) {
  return job && job.attemptsMade >= (job.opts?.attempts ?? 1);
}

module.exports = { runDlqRetryJob, enqueueDlq, isFinalAttempt };
