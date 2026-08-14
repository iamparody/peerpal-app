const { query } = require('../db');

async function runVentPurgeJob() {
  const { rowCount } = await query('DELETE FROM vents WHERE purge_after < NOW()');
  if (rowCount > 0) console.log(`[ventPurge] Deleted ${rowCount} expired vent record(s).`);
}

module.exports = { runVentPurgeJob };
