require('dotenv').config();
const { initSentry } = require('./services/sentry');
initSentry(); // must be before any other require that might throw
const http = require('http');
const cron = require('node-cron');
const app = require('./app');
const { createSignalingServer } = require('./ws/signaling');
const { runRoutingJob } = require('./jobs/routingJob');
const { runRiskScoreJob } = require('./jobs/riskScoreJob');
const { runCheckinReminderJob } = require('./jobs/checkinReminderJob');
const { runDailySummaryJob } = require('./jobs/dailySummaryJob');
const { runDeletionJob } = require('./jobs/deletionJob');
const { runVentPurgeJob } = require('./jobs/ventPurgeJob');
const { runPermissionInactivityJob } = require('./jobs/permissionInactivityJob');
const { runVersionDriftJob } = require('./jobs/versionDriftJob');
const { runFlagAggregationJob } = require('./jobs/flagAggregationJob');
const { runBanExpiryJob }              = require('./jobs/banExpiryJob');
const { runSlotLockCleanupJob }        = require('./jobs/slotLockCleanupJob');
const { runTherapistNoShowJob }        = require('./jobs/therapistNoShowJob');
const { runEscrowReleaseJob }          = require('./jobs/escrowReleaseJob');
const { runPreSessionCheckinJob }      = require('./jobs/preSessionCheckinJob');
const { runPreSessionReminderJob }     = require('./jobs/preSessionReminderJob');
const { runPayoutReconciliationJob }   = require('./jobs/payoutReconciliationJob');
const { runPayoutRetryJob }            = require('./jobs/payoutRetryJob');
const { runMemberNoShowJob }           = require('./jobs/memberNoShowJob');
const { startEmailWorker } = require('./workers/emailWorker');
const { startNotificationWorker } = require('./workers/notificationWorker');

const PORT = process.env.PORT || 3001;

const server = http.createServer(app);

createSignalingServer(server);

// ─── Queue workers ────────────────────────────────────────────────────────────
startEmailWorker();
startNotificationWorker();

// ─── Background jobs ──────────────────────────────────────────────────────────
// Peer routing catch-all — every 2 minutes (handles requests whose in-process
// timers were lost due to server restart or Render free-tier sleep)
cron.schedule('*/2 * * * *', () => runRoutingJob().catch(console.error));

// Risk score recalculation — midnight UTC
cron.schedule('0 0 * * *', () => runRiskScoreJob().catch(console.error));

// Check-in reminder — 17:00 UTC (8pm Nairobi EAT)
cron.schedule('0 17 * * *', () => runCheckinReminderJob().catch(console.error));

// Daily summary / journal prompt — 18:00 UTC (9pm Nairobi EAT)
cron.schedule('0 18 * * *', () => runDailySummaryJob().catch(console.error));

// Account deletion processing — every hour
cron.schedule('0 * * * *', () => runDeletionJob().catch(console.error));

// Vent record purge — 04:00 UTC daily (7am Nairobi EAT), enforces 90-day retention
cron.schedule('0 4 * * *', () => runVentPurgeJob().catch(console.error));

// Permission inactivity expiry — 01:00 UTC (4am Nairobi EAT)
cron.schedule('0 1 * * *', () => runPermissionInactivityJob().catch(console.error));

// Permission version drift check — 02:00 UTC (5am Nairobi EAT)
cron.schedule('0 2 * * *', () => runVersionDriftJob().catch(console.error));

// Quality signal flag aggregation — 03:00 UTC (6am Nairobi EAT)
cron.schedule('0 3 * * *', () => runFlagAggregationJob().catch(console.error));

// Group ban expiry — every hour, lifts bans whose expires_at has passed
cron.schedule('0 * * * *', () => runBanExpiryJob().catch(console.error));

// ─── Phase 37: Therapy marketplace background jobs ────────────────────────────

// Slot lock cleanup — every 5 min
cron.schedule('*/5 * * * *', () => runSlotLockCleanupJob().catch(console.error));

// Therapist no-show detection — every 10 min
cron.schedule('*/10 * * * *', () => runTherapistNoShowJob().catch(console.error));

// Member no-show detection — every 10 min
cron.schedule('*/10 * * * *', () => runMemberNoShowJob().catch(console.error));

// Pre-session checkin — every 5 min (sends checkin at 30-min mark)
cron.schedule('*/5 * * * *', () => runPreSessionCheckinJob().catch(console.error));

// Pre-session reminder — every 5 min (sends reminder at 15-min mark)
cron.schedule('*/5 * * * *', () => runPreSessionReminderJob().catch(console.error));

// Escrow release — hourly (releases 24h after session end, no open dispute)
cron.schedule('0 * * * *', () => runEscrowReleaseJob().catch(console.error));

// Payout reconciliation — 02:00 EAT daily (checks stuck processing payouts)
cron.schedule('0 23 * * *', () => runPayoutReconciliationJob().catch(console.error));

// Payout retry — 03:00 EAT daily (retries failed payouts with retry_count <= 1)
cron.schedule('0 0 * * *', () => runPayoutRetryJob().catch(console.error));

server.listen(PORT, () => {
  console.log(`PeerPal backend listening on port ${PORT} [${process.env.NODE_ENV || 'development'}]`);
});

process.on('unhandledRejection', (reason) => {
  console.error('Unhandled promise rejection:', reason);
});

module.exports = server;
