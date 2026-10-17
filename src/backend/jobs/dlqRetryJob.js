const { query } = require('../db');
const logger = require('../utils/logger');

// Exponential backoff: attempt 1 = 5 min, 2 = 30 min, 3 = 2 hr
const BACKOFF_MINUTES = [5, 30, 120];
const BATCH_SIZE = 20;

async function runDlqRetryJob() {
  const { rows } = await query(
    `SELECT id, job_type, payload, attempts, max_attempts
     FROM dlq_jobs
     WHERE status = 'pending' AND next_retry_at <= NOW()
     ORDER BY next_retry_at ASC
     LIMIT $1
     FOR UPDATE SKIP LOCKED`,
    [BATCH_SIZE]
  );

  if (!rows.length) return;

  logger.info({ count: rows.length }, 'dlqRetryJob: processing batch');

  for (const job of rows) {
    const { id, job_type, payload, attempts, max_attempts } = job;

    try {
      if (job_type === 'push') {
        const { sendPushNotification } = require('../utils/fcm');
        await sendPushNotification(payload.fcm_token, payload.title, payload.body, payload.data || {});
      } else if (job_type === 'email') {
        const { deliverEmail } = require('../services/emailService');
        await deliverEmail(payload.to, payload.subject, payload.html);
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
      const backoffMs = (BACKOFF_MINUTES[newAttempts - 1] || 120) * 60 * 1000;

      await query(
        `UPDATE dlq_jobs
         SET status = $1,
             attempts = $2,
             last_attempted_at = NOW(),
             next_retry_at = NOW() + ($3 || ' milliseconds')::interval,
             error_message = $4,
             updated_at = NOW()
         WHERE id = $5`,
        [isDead ? 'dead' : 'pending', newAttempts, backoffMs, err.message, id]
      );

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

module.exports = { runDlqRetryJob, enqueueDlq };
