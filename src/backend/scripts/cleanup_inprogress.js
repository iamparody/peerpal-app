// Close all orphaned in_progress test sessions for the test therapist
require('dotenv').config();
const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 2 });

async function main() {
  // End the therapy_sessions rows
  const s = await pool.query(
    `UPDATE therapy_sessions SET ended_at = NOW()
     WHERE booking_id IN (
       SELECT id FROM therapist_bookings
       WHERE therapist_id = $1 AND status = 'in_progress'
     ) AND ended_at IS NULL`,
    ['6b8885e3-e2d7-45a8-82a1-e620ec25ccf5']
  );
  console.log('Sessions ended:', s.rowCount);

  // Mark bookings as cancelled
  const b = await pool.query(
    `UPDATE therapist_bookings SET status = 'cancelled'
     WHERE therapist_id = $1 AND status = 'in_progress'`,
    ['6b8885e3-e2d7-45a8-82a1-e620ec25ccf5']
  );
  console.log('Bookings cancelled:', b.rowCount);
}

main().then(() => pool.end()).catch(e => { console.error(e.message); pool.end(); });
