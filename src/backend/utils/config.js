const { query } = require('../db');
const cache = require('../services/cache');

const TTL = 300; // 5 minutes

async function getConfig(key, fallback = null) {
  const cacheKey = `config:${key}`;
  const cached = await cache.get(cacheKey);
  if (cached !== null) return cached;
  const { rows } = await query(`SELECT value FROM platform_config WHERE key = $1`, [key]);
  const value = rows.length ? rows[0].value : fallback;
  if (value !== null) await cache.set(cacheKey, value, TTL);
  return value;
}

async function invalidateConfig(key) {
  await cache.del(`config:${key}`);
}

module.exports = { getConfig, invalidateConfig };
