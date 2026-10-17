const { Worker } = require('bullmq');
const logger = require('../utils/logger');

const { createQueueClient } = require('../config/redis');
const { sendPushNotification } = require('../utils/fcm');
const { enqueueDlq } = require('../jobs/dlqRetryJob');

function startNotificationWorker() {
  const connection = createQueueClient();
  if (!connection) {
    logger.warn('[notificationWorker] Redis unavailable — worker not started');
    return null;
  }

  const worker = new Worker('notification', async (job) => {
    const { fcm_token, title, body, data } = job.data;
    await sendPushNotification(fcm_token, title, body, data);
  }, { connection });

  worker.on('failed', (job, err) => {
    logger.error({ jobId: job?.id, attempt: job?.attemptsMade, err }, '[notificationWorker] job failed');
    if (job && job.attemptsMade >= (job.opts?.attempts ?? 1)) {
      enqueueDlq('push', job.data, err.message);
    }
  });

  return worker;
}

module.exports = { startNotificationWorker };
