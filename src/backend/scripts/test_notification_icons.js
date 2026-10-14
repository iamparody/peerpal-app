'use strict';

/**
 * One-time test: sends two notifications directly to EarlyTiger80's FCM token.
 * Bypasses cooldowns, quiet hours, and eligibility checks.
 * Purpose: verify blob-neutral.png icon and badge render on Android.
 *
 * Usage: node src/backend/scripts/test_notification_icons.js
 */

require('dotenv').config();

const { query } = require('../db');
const { enqueuePushNotification } = require('../utils/fcm');

const TARGET_ALIAS = 'EarlyTiger80';

async function main() {
  const { rows } = await query(
    `SELECT id, alias, fcm_token FROM users WHERE alias = $1 AND fcm_token IS NOT NULL LIMIT 1`,
    [TARGET_ALIAS]
  );

  if (!rows.length) {
    console.error(`No user found with alias ${TARGET_ALIAS} and FCM token`);
    process.exit(1);
  }

  const { id, alias, fcm_token } = rows[0];
  console.log(`Sending to ${alias} (${id})\n`);

  // Test 1: dormant_nudge — uses blob-neutral icon (default for all notifications)
  await enqueuePushNotification(
    fcm_token,
    'Test 1: blob-neutral icon',
    "Whatever brought you here today, it's enough. Someone is ready to listen.",
    { type: 'dormant_nudge', route: '/peer' }
  );
  console.log('Sent test 1 (dormant_nudge) — check for sage green blob icon');

  // Small delay between sends
  await new Promise(r => setTimeout(r, 2000));

  // Test 2: first_call_nudge — same icon path, different copy
  await enqueuePushNotification(
    fcm_token,
    'Test 2: first call nudge',
    'Someone is ready to listen when you are.',
    { type: 'first_call_nudge', route: '/peer' }
  );
  console.log('Sent test 2 (first_call_nudge) — check copy and icon');

  console.log('\nBoth sent. Check Android device for:');
  console.log('  - Sage green blob icon (not generic Chrome globe)');
  console.log('  - Heartbeat badge on app icon in status bar');
  console.log('  - No duplicate notifications');
  console.log('  - Tapping routes to /peer');

  process.exit(0);
}

main().catch(e => { console.error(e.message); process.exit(1); });
