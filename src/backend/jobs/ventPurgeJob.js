const { query } = require('../db');
const logger = require('../utils/logger');


async function runVentPurgeJob() {
  const { rowCount } = await query('DELETE FROM vents WHERE purge_after < NOW()');
  if (rowCount > 0) logger.info(`[ventPurge] Deleted ${rowCount} expired vent record(s).`);
}

module.exports = { runVentPurgeJob };
