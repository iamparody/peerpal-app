// Resets the test therapist to a known-good state for local testing.
// Usage: node scripts/reset_test_therapist.js
require('dotenv').config();
const bcrypt = require('bcrypt');
const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 2 });

const TEST_EMAIL = 'dr.test.wanjiku@peerpal.test';
const TEST_PASS  = 'Test1234!';

async function main() {
  // 1. Check the user exists
  const { rows: users } = await pool.query(
    `SELECT id, email, role FROM users WHERE email = $1`,
    [TEST_EMAIL]
  );

  if (!users.length) {
    console.error(`✗ No user found with email ${TEST_EMAIL}`);
    console.error('  Run create_test_booking.js first to seed the test data.');
    process.exit(1);
  }

  const userId = users[0].id;

  // 2. Reset password + ensure email verified
  const hash = await bcrypt.hash(TEST_PASS, 10);
  await pool.query(
    `UPDATE users SET password_hash = $1, email_verified = true WHERE id = $2`,
    [hash, userId]
  );

  // 3. Ensure therapist_profile exists and is in a testable state
  const { rows: profs } = await pool.query(
    `SELECT id FROM therapist_profiles WHERE user_id = $1`,
    [userId]
  );

  if (!profs.length) {
    console.error(`✗ No therapist_profile found for user ${userId}`);
    console.error('  The profile row is missing — run create_test_booking.js to seed it.');
    process.exit(1);
  }

  await pool.query(
    `UPDATE therapist_profiles
     SET is_verified = true, onboarding_complete = true, suspended = false
     WHERE user_id = $1`,
    [userId]
  );

  console.log('\n✓ Test therapist ready');
  console.log('  Email   :', TEST_EMAIL);
  console.log('  Password:', TEST_PASS);
  console.log('  URL     : http://localhost:5176');
  console.log('\n  Account is: verified ✓  onboarding complete ✓  not suspended ✓');
}

main()
  .then(() => pool.end())
  .catch((e) => { console.error('Error:', e.message); pool.end(); process.exit(1); });
