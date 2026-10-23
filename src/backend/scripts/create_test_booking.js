// Create a completed test booking between the first verified therapist and first active member.
// Usage: node scripts/create_test_booking.js
require('dotenv').config();
const { Pool } = require('pg');
const { v4: uuidv4 } = require('uuid');

const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false }, max: 2 });

async function main() {
  // Pick first verified therapist
  const { rows: therapists } = await pool.query(
    `SELECT tp.id as prof_id, u.id as user_id, u.email
     FROM therapist_profiles tp JOIN users u ON u.id = tp.user_id
     WHERE tp.is_verified = true AND u.is_active = true LIMIT 1`
  );
  if (!therapists.length) throw new Error('No verified therapists found');
  const { prof_id: therapistProfId, email: therapistEmail } = therapists[0];

  // Pick first non-therapist member
  const { rows: members } = await pool.query(
    `SELECT u.id, u.email FROM users u
     LEFT JOIN therapist_profiles tp ON tp.user_id = u.id
     WHERE tp.id IS NULL AND u.is_active = true LIMIT 1`
  );
  if (!members.length) throw new Error('No member users found');
  const { id: memberId, email: memberEmail } = members[0];

  // Ensure therapy consent
  await pool.query(
    `UPDATE users SET therapy_consent_version='2.0', therapy_consented_at=NOW() WHERE id=$1`,
    [memberId]
  );

  const { rows: catRows } = await pool.query('SELECT id FROM therapist_categories LIMIT 1');
  if (!catRows.length) throw new Error('No therapist_categories rows — seed first');
  const catId = catRows[0].id;

  const bookingId   = uuidv4();
  const scheduledAt = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(); // 2h ago = completed

  await pool.query(`
    INSERT INTO therapist_bookings
      (id, member_user_id, therapist_id, category_id, session_format,
       scheduled_at, duration_minutes, status, payment_status,
       credit_charged, rate_kes, platform_fee_kes, therapist_payout_kes, escrow_status,
       therapist_rate_kes, client_charge_kes, idempotency_key)
    VALUES ($1,$2,$3,$4,'video',$5,60,'completed','paid',1,1000,200,800,'released',1000,1000,$6)
  `, [bookingId, memberId, therapistProfId, catId, scheduledAt, uuidv4()]);

  console.log('\n✓ Completed test booking created');
  console.log('  Booking ID  :', bookingId);
  console.log('  Therapist   :', therapistEmail);
  console.log('  Member      :', memberEmail);
  await pool.end();
}

main().catch(e => { console.error('Error:', e.message); process.exit(1); });
