require('dotenv').config();
const { Pool } = require('pg');
const p = new Pool({ connectionString: process.env.DATABASE_URL, max: 2 });

const TEST_IDS = [
  'dd95f451-12de-47f7-bf9d-85d58c2f7ae9','d59f1da3-ecc6-4c84-8156-872fdf09219d',
  '95b091ef-51ec-41d8-9f65-a1992c2b9532','a1b85411-1a5f-4d49-9b89-23c523299b36',
  '79f50f42-4d41-4f4d-a9f5-a6f3216ce44e','ac8992a5-5a80-44bb-9011-ac15c47719d3',
  '3a2118db-a25a-46b9-a836-1cf203301f0d','95fcfa26-3218-49ae-9bcd-43410f2a2fad',
  '45eeed09-3c58-49f0-bb4a-7e5883aca94b','2f766662-24e5-4a95-ba4f-dadc41df6127',
  '110163ba-f3a8-4cde-8205-b3321243540c','f5259019-4447-45eb-bdd6-7a3076ce0a5a',
  'ab983779-f102-45c6-933a-7614df2cc20e','ab60f15a-c86b-4907-b0be-ecfb2884b548',
  'bdd40d87-bd91-4c13-a54f-39a559eaa43c','b63f956f-c74b-4376-a188-c54988d6ac7c',
  'acb72e6c-05b0-493a-a76a-49315f6f6457','2db93690-29c4-4f08-91a0-959c9ea25e7f',
  'd77b79c9-45dc-44a1-9a8f-08c743ee3764','76b4cd3e-5b9e-490c-8e87-406a77d170ca',
  'c4d45d3e-270a-4ad1-aadd-198e64750bae','eb5b2321-2588-4a9d-9701-aca256149909',
  'd7215beb-5edd-4ddd-873a-8d43c2c0ab66',
];
const NEW = '9065587d-9518-40cb-a008-b2f22091f349';

async function run(sql, label) {
  try {
    const r = await p.query(sql, [NEW, TEST_IDS]);
    if (r.rowCount > 0) console.log(`  ${label}: ${r.rowCount}`);
  } catch (e) {
    console.log(`  ${label} ERROR: ${e.message}`);
  }
}

async function del(table, col) {
  try {
    const r = await p.query(`DELETE FROM ${table} WHERE ${col} = ANY($1)`, [TEST_IDS]);
    if (r.rowCount > 0) console.log(`  DELETE ${table}.${col}: ${r.rowCount}`);
  } catch (e) {
    console.log(`  DELETE ${table}.${col} ERROR: ${e.message}`);
  }
}

async function nullify(table, col) {
  try {
    const r = await p.query(`UPDATE ${table} SET ${col} = NULL WHERE ${col} = ANY($1)`, [TEST_IDS]);
    if (r.rowCount > 0) console.log(`  NULL ${table}.${col}: ${r.rowCount}`);
  } catch (e) {
    console.log(`  NULL ${table}.${col} ERROR: ${e.message}`);
  }
}

async function reassign(table, col) {
  try {
    const r = await p.query(`UPDATE ${table} SET ${col} = $1 WHERE ${col} = ANY($2)`, [NEW, TEST_IDS]);
    if (r.rowCount > 0) console.log(`  REASSIGN ${table}.${col}: ${r.rowCount}`);
  } catch (e) {
    console.log(`  REASSIGN ${table}.${col} ERROR: ${e.message}`);
  }
}

async function main() {
  console.log('Clearing all FK blockers...\n');

  // Reassign non-nullable FKs used as admin/resolver references
  await reassign('therapy_disputes', 'resolved_by');
  await reassign('therapy_disputes', 'raised_by');
  await reassign('promo_codes', 'created_by');

  // Nullable FKs — set to NULL
  await nullify('peer_permissions', 'revoked_by');
  await nullify('emergency_logs', 'handled_by');
  await nullify('group_messages', 'deleted_by');
  await nullify('group_bans', 'banned_by');
  await nullify('permission_flags', 'reviewer_id');
  await nullify('peer_requests', 'accepted_by');

  // Delete rows owned by test users across all child tables
  await del('booking_slot_locks', 'locked_by');
  await del('session_reflections', 'peer_user_id');
  await del('vents', 'user_id');
  await del('events', 'user_id');
  await del('skill_attempts', 'user_id');
  await del('therapist_bookings', 'member_user_id');
  await del('therapist_ratings', 'member_user_id');
  await del('peer_reports', 'reporter_id');
  await del('group_reactions', 'user_id');
  await del('group_poll_votes', 'user_id');
  await del('group_polls', 'posted_by');
  await del('group_reports', 'reported_user_id');
  await del('group_reports', 'reported_by');
  await del('peer_skills', 'user_id');
  await del('peer_stats', 'user_id');
  await del('ai_memories', 'user_id');
  await del('ai_usage', 'user_id');
  await del('ai_generated', 'user_id');
  await del('ai_decided', 'user_id');
  await del('ai_detected', 'user_id');
  await del('ai_detected_source', 'user_id');
  await del('peer_permissions', 'user_id');

  console.log('\nDone. Now run: DRY_RUN=false node scripts/cleanup_test_data.js');
}

main().catch(e => console.error('Fatal:', e.message)).finally(() => p.end());
