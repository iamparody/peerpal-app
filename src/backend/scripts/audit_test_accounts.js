require('dotenv').config();
const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 2 });

async function audit() {
  // Known test/dev email patterns
  const testPatterns = [
    '%test%',
    '%seed%',
    '%dummy%',
    '%fake%',
    '%demo%',
    '%parody%',
    '%akirinya%',
    '%@mailinator%',
    '%@yopmail%',
    '%+test%',
  ];

  const placeholders = testPatterns.map((_, i) => `email ILIKE $${i + 1}`).join(' OR ');

  const { rows: testUsers } = await pool.query(
    `SELECT id, email, alias, created_at, trial_claimed_at,
            (SELECT COUNT(*) FROM peer_requests WHERE user_id = u.id) AS peer_requests,
            (SELECT COUNT(*) FROM sessions      WHERE user_id = u.id) AS sessions,
            (SELECT COUNT(*) FROM moods          WHERE user_id = u.id) AS moods,
            (SELECT COUNT(*) FROM credit_transactions WHERE user_id = u.id) AS credit_txs
     FROM users u
     WHERE ${placeholders}
     ORDER BY created_at DESC`,
    testPatterns
  );

  // Also show all users for manual review (newest 30)
  const { rows: allUsers } = await pool.query(
    `SELECT id, email, alias, created_at,
            (SELECT COUNT(*) FROM peer_requests WHERE user_id = u.id) AS peer_requests,
            (SELECT COUNT(*) FROM sessions      WHERE user_id = u.id) AS sessions
     FROM users u
     ORDER BY created_at ASC
     LIMIT 50`
  );

  console.log('\n=== FLAGGED AS POTENTIAL TEST ACCOUNTS ===');
  if (testUsers.length === 0) {
    console.log('None found matching test patterns.');
  } else {
    testUsers.forEach(u => {
      console.log(`  ID:      ${u.id}`);
      console.log(`  Email:   ${u.email}`);
      console.log(`  Alias:   ${u.alias}`);
      console.log(`  Created: ${new Date(u.created_at).toISOString()}`);
      console.log(`  Activity: ${u.peer_requests} peer reqs | ${u.sessions} sessions | ${u.moods} moods | ${u.credit_txs} credit txs`);
      console.log('  ---');
    });
  }

  console.log(`\n=== ALL USERS (oldest first, max 50) ===`);
  allUsers.forEach((u, i) => {
    console.log(`  ${String(i + 1).padStart(2)}. ${u.email.padEnd(35)} alias: ${(u.alias || '—').padEnd(20)} created: ${new Date(u.created_at).toLocaleDateString('en-KE')}  [${u.peer_requests} reqs | ${u.sessions} sessions]`);
  });

  console.log(`\nTotal users in DB: checking...`);
  const { rows: countRow } = await pool.query('SELECT COUNT(*) FROM users');
  console.log(`Total users: ${countRow[0].count}`);
}

audit().catch(e => console.error(e.message)).finally(() => pool.end());
