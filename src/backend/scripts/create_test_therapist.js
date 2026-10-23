// Creates (or resets) a local test therapist for dev/verification.
// Usage: node scripts/create_test_therapist.js
require('dotenv').config();
const bcrypt = require('bcrypt');
const { Pool } = require('pg');

const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 2 });

const EMAIL = 'dr.test.wanjiku@peerpal.test';
const PASS  = 'Test1234!';

async function main() {
  const hash = await bcrypt.hash(PASS, 10);

  // ── 1. Upsert user ──────────────────────────────────────────────────────────
  const { rows: existing } = await pool.query(
    'SELECT id FROM users WHERE email = $1',
    [EMAIL]
  );

  let userId;
  if (existing.length) {
    userId = existing[0].id;
    await pool.query(
      `UPDATE users
       SET password_hash = $1,
           email_verified = true,
           role = 'therapist'
       WHERE id = $2`,
      [hash, userId]
    );
    console.log('  ↻ Existing user reset:', userId);
  } else {
    const { rows } = await pool.query(
      `INSERT INTO users (email, password_hash, alias, role, consent_version, email_verified)
       VALUES ($1, $2, 'Dr. Wanjiku', 'therapist', '1.0', true)
       RETURNING id`,
      [EMAIL, hash]
    );
    userId = rows[0].id;
    console.log('  + New user created:', userId);
  }

  // ── 2. Upsert therapist_profiles ────────────────────────────────────────────
  const { rows: profs } = await pool.query(
    'SELECT id FROM therapist_profiles WHERE user_id = $1',
    [userId]
  );

  if (profs.length) {
    await pool.query(
      `UPDATE therapist_profiles
       SET is_verified = true,
           onboarding_complete = true,
           suspended = false,
           is_active = true
       WHERE user_id = $1`,
      [userId]
    );
    console.log('  ↻ Existing profile unlocked:', profs[0].id);
  } else {
    const { rows: pRows } = await pool.query(
      `INSERT INTO therapist_profiles
         (user_id, display_name, full_name, credentials, years_experience,
          languages, session_formats, location, statement,
          plain_language_intro, cultural_competencies, approach_plain,
          photo_url, availability_status, gender, age, rate_per_session_kes,
          mpesa_number, category_ids,
          is_verified, onboarding_complete, suspended, is_active)
       VALUES ($1,'Dr. Wanjiku','Dr. Amina Wanjiku','M.Sc. Clinical Psychology',5,
               ARRAY['English','Swahili'], ARRAY['video','text'],
               'Nairobi', 'Compassionate, evidence-based support.',
               'I help people work through anxiety and depression using CBT.',
               ARRAY['Anxiety','Depression'], 'Solution-focused CBT',
               NULL, 'available', 'female', 34, 3000,
               NULL, ARRAY[]::uuid[],
               true, true, false, true)
       RETURNING id`,
      [userId]
    );
    console.log('  + New profile created:', pRows[0].id);
  }

  console.log('\n✓ Test therapist ready');
  console.log('  Email   :', EMAIL);
  console.log('  Password:', PASS);
  console.log('  URL     : http://localhost:5176');
  console.log('  State   : verified ✓  onboarding complete ✓  not suspended ✓');
}

main()
  .then(() => pool.end())
  .catch((e) => { console.error('\n✗ Error:', e.message); pool.end(); process.exit(1); });
