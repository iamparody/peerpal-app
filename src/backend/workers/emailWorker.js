const { Worker } = require('bullmq');
const logger = require('../utils/logger');

const { createQueueClient } = require('../config/redis');
const { deliverEmail } = require('../services/emailService');
const { enqueueDlq, isFinalAttempt } = require('../jobs/dlqRetryJob');

function startEmailWorker() {
  const connection = createQueueClient();
  if (!connection) {
    logger.warn('[emailWorker] Redis unavailable — worker not started');
    return null;
  }

  const worker = new Worker('email', async (job) => {
    const { to, subject, html } = job.data;
    await deliverEmail(to, subject, html);
  }, { connection });

  worker.on('completed', (job) => {
    if (process.env.NODE_ENV === 'development') {
      logger.info(`[emailWorker] Job ${job.id} completed`);
    }
  });

  worker.on('failed', (job, err) => {
    logger.error({ jobId: job?.id, attempt: job?.attemptsMade, err }, '[emailWorker] job failed');
    // Write to DLQ only after final BullMQ attempt
    if (isFinalAttempt(job)) {
      enqueueDlq('email', job.data, err.message);
    }
  });

  return worker;
}

module.exports = { startEmailWorker };
