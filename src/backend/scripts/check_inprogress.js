require('dotenv').config();
const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 2 });
pool.query(
  `SELECT tb.id, tb.status, ts.id as session_id, ts.ended_at
   FROM therapist_bookings tb
   LEFT JOIN therapy_sessions ts ON ts.booking_id = tb.id
   WHERE tb.therapist_id = $1 AND tb.status = 'in_progress'
   ORDER BY tb.created_at DESC`,
  ['6b8885e3-e2d7-45a8-82a1-e620ec25ccf5']
).then(r => { console.log(r.rows); pool.end(); }).catch(e => { console.error(e.message); pool.end(); });
