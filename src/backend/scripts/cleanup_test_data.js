require('dotenv').config();
const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 2 });

const DRY_RUN = process.env.DRY_RUN !== 'false';

// Explicit list of confirmed test account IDs — do not use pattern matching for deletes
const TEST_USER_IDS = [
  // @mindbridge.test / @peerpal.test / @mb.test seeds
  'dd95f451-12de-47f7-bf9d-85d58c2f7ae9', // david.mwangi@mindbridge.test
  'd59f1da3-ecc6-4c84-8156-872fdf09219d', // amara.odhiambo@mindbridge.test
  '95b091ef-51ec-41d8-9f65-a1992c2b9532', // test174_a_1778961003640@mb.test
  'a1b85411-1a5f-4d49-9b89-23c523299b36', // test174_r_1778960934508@mb.test
  '79f50f42-4d41-4f4d-a9f5-a6f3216ce44e', // test17_1778960682859@mindbridge.test
  'ac8992a5-5a80-44bb-9011-ac15c47719d3', // test17_3166@mindbridge.test
  '3a2118db-a25a-46b9-a836-1cf203301f0d', // test1777392824@mindbridge.test
  '95fcfa26-3218-49ae-9bcd-43410f2a2fad', // test1777392788@mindbridge.test
  '45eeed09-3c58-49f0-bb4a-7e5883aca94b', // test1777392775@mindbridge.test
  '2f766662-24e5-4a95-ba4f-dadc41df6127', // testuser@mindbridge.test
  '110163ba-f3a8-4cde-8205-b3321243540c', // smoketest_1777445602@mindbridge.test
  'f5259019-4447-45eb-bdd6-7a3076ce0a5a', // dr.test.wanjiku@peerpal.test
  'ab983779-f102-45c6-933a-7614df2cc20e', // verify37@peerpal.test
  'ab60f15a-c86b-4907-b0be-ecfb2884b548', // member.verify37@peerpal.test
  'bdd40d87-bd91-4c13-a54f-39a559eaa43c', // testtherapist@test.com
  'b63f956f-c74b-4376-a188-c54988d6ac7c', // test.therapist@peerpal.test
  // @example.com / @test.com smoke tests
  'acb72e6c-05b0-493a-a76a-49315f6f6457', // test_smoke_dupe@example.com
  '2db93690-29c4-4f08-91a0-959c9ea25e7f', // test_smoke_1777363455406@example.com
  'd77b79c9-45dc-44a1-9a8f-08c743ee3764', // smoke3_1777364053010@test.com
  '76b4cd3e-5b9e-490c-8e87-406a77d170ca', // test@test.com
  'c4d45d3e-270a-4ad1-aadd-198e64750bae', // debugtest_1777555439@test.com
  'eb5b2321-2588-4a9d-9701-aca256149909', // testresume29@test.com
  'd7215beb-5edd-4ddd-873a-8d43c2c0ab66', // helper29@test.com
  // Old admin seed
  '110163ba-f3a8-4cde-8205-b3321243540c', // admin@mindbridge.app (same as smoketest — already listed, dedup below)
];

// Deduplicate
const USER_IDS = [...new Set(TEST_USER_IDS)];

const TABLES = [
  // Child tables first (FK-safe order)
  { table: 'notifications',        col: 'user_id' },
  { table: 'ai_interactions',      col: 'user_id' },
  { table: 'escalation_logs',      col: 'user_id' },
  { table: 'safety_plans',         col: 'user_id' },
  { table: 'journals',             col: 'user_id' },
  { table: 'moods',                col: 'user_id' },
  { table: 'group_memberships',    col: 'user_id' },
  { table: 'group_messages',       col: 'user_id' },
  { table: 'group_reports',        col: 'reported_by' },
  { table: 'group_bans',           col: 'user_id' },
  { table: 'emergency_logs',       col: 'user_id' },
  { table: 'credit_transactions',  col: 'user_id' },
  { table: 'promo_code_redemptions', col: 'user_id' },
  { table: 'peer_requests',        col: 'user_id' },
  { table: 'sessions',             col: 'user_id' },
  { table: 'credits',              col: 'user_id' },
  { table: 'ai_personas',          col: 'user_id' },
  // Users last
  { table: 'users',                col: 'id' },
];

async function run() {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`MODE: ${DRY_RUN ? 'DRY RUN — no changes will be made' : '*** LIVE DELETE ***'}`);
  console.log(`Targeting ${USER_IDS.length} test user IDs`);
  console.log('='.repeat(60));

  // Safety check — verify none of the IDs are real users we want to keep
  const { rows: verify } = await pool.query(
    `SELECT id, email, alias FROM users WHERE id = ANY($1)`,
    [USER_IDS]
  );
  console.log(`\nAccounts that will be affected (${verify.length}):`);
  verify.forEach(u => console.log(`  - ${u.email.padEnd(45)} ${u.alias}`));

  console.log('\nRows to be deleted per table:');
  let totalRows = 0;
  for (const { table, col } of TABLES) {
    try {
      const { rows } = await pool.query(
        `SELECT COUNT(*) FROM ${table} WHERE ${col} = ANY($1)`,
        [USER_IDS]
      );
      const count = parseInt(rows[0].count);
      totalRows += count;
      if (count > 0) console.log(`  ${table.padEnd(30)} ${count} rows`);
    } catch (e) {
      console.log(`  ${table.padEnd(30)} SKIP (${e.message})`);
    }
  }
  console.log(`  ${'TOTAL'.padEnd(30)} ${totalRows} rows`);

  if (DRY_RUN) {
    console.log('\nDRY RUN complete. To execute, run:');
    console.log('  DRY_RUN=false node scripts/cleanup_test_data.js\n');
    return;
  }

  // Live delete
  console.log('\nExecuting deletes...');
  for (const { table, col } of TABLES) {
    try {
      const result = await pool.query(
        `DELETE FROM ${table} WHERE ${col} = ANY($1)`,
        [USER_IDS]
      );
      if (result.rowCount > 0) console.log(`  Deleted ${result.rowCount} rows from ${table}`);
    } catch (e) {
      console.log(`  SKIP ${table}: ${e.message}`);
    }
  }
  console.log('\nCleanup complete.');

  // Final count
  const { rows: remaining } = await pool.query('SELECT COUNT(*) FROM users');
  console.log(`Users remaining in DB: ${remaining[0].count}`);
}

run().catch(e => console.error('Fatal:', e.message)).finally(() => pool.end());
