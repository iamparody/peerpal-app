// One-shot script: set a known password for a therapist account by email.
// Usage: node scripts/set_therapist_password.js <email> <password>
// Example: node scripts/set_therapist_password.js dr.test.wanjiku@peerpal.test Therapist@123

require('dotenv').config({ path: require('path').join(__dirname, '../src/backend/.env') });
const bcrypt = require('bcrypt');
const { Pool } = require('pg');

const [,, email, password] = process.argv;
if (!email || !password) {
  console.error('Usage: node scripts/set_therapist_password.js <email> <password>');
  process.exit(1);
}

const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });

async function run() {
  const hash = await bcrypt.hash(password, 12);
  const { rowCount, rows } = await pool.query(
    `UPDATE users SET password_hash = $1, reset_token_hash = NULL, reset_token_expires = NULL
     WHERE email = $2 AND role = 'therapist' RETURNING email, alias, role`,
    [hash, email.toLowerCase().trim()]
  );
  if (!rowCount) {
    console.error(`No therapist account found for ${email}`);
    process.exit(1);
  }
  console.log(`✓ Password set for ${rows[0].email} (alias: ${rows[0].alias}, role: ${rows[0].role})`);
  await pool.end();
}

run().catch(e => { console.error(e.message); process.exit(1); });
