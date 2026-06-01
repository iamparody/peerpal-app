require('dotenv').config();
const { initSentry } = require('./services/sentry');
initSentry(); // must be before any other require that might throw
const http = require('http');
const cron = require('node-cron');
const app = require('./app');
const { createSignalingServer } = require('./ws/signaling');
const { runRiskScoreJob } = require('./jobs/riskScoreJob');
const { runCheckinReminderJob } = require('./jobs/checkinReminderJob');
const { runDailySummaryJob } = require('./jobs/dailySummaryJob');
const { runDeletionJob } = require('./jobs/deletionJob');
const { startEmailWorker } = require('./workers/emailWorker');
const { startNotificationWorker } = require('./workers/notificationWorker');

const PORT = process.env.PORT || 3001;

const server = http.createServer(app);

createSignalingServer(server);

// ─── Queue workers ────────────────────────────────────────────────────────────
startEmailWorker();
startNotificationWorker();

// ─── Background jobs ──────────────────────────────────────────────────────────
// Risk score recalculation — midnight UTC
cron.schedule('0 0 * * *', () => runRiskScoreJob().catch(console.error));

// Check-in reminder — 17:00 UTC (8pm Nairobi EAT)
cron.schedule('0 17 * * *', () => runCheckinReminderJob().catch(console.error));

// Daily summary / journal prompt — 18:00 UTC (9pm Nairobi EAT)
cron.schedule('0 18 * * *', () => runDailySummaryJob().catch(console.error));

// Account deletion processing — every hour
cron.schedule('0 * * * *', () => runDeletionJob().catch(console.error));

server.listen(PORT, () => {
  console.log(`Melah backend listening on port ${PORT} [${process.env.NODE_ENV || 'development'}]`);
});

process.on('unhandledRejection', (reason) => {
  console.error('Unhandled promise rejection:', reason);
});

module.exports = server;
