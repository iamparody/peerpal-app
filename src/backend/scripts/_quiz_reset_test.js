const { query } = require('../db');
const email = process.argv[2];
const val = process.argv[3] === 'true';
query(
  'UPDATE users SET peer_quiz_done = $1 WHERE email = $2',
  [val, email]
).then(r => { console.log(`${email} → peer_quiz_done=${val} (${r.rowCount} row)`); process.exit(0); })
 .catch(e => { console.error(e.message); process.exit(1); });
