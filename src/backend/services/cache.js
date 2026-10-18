const { getRestClient } = require('../config/redis');
const logger = require('../utils/logger');


function client() {
  return getRestClient();
}

async function get(key) {
  try {
    const r = client();
    if (!r) return null;
    const val = await r.get(key);
    return val !== null ? JSON.parse(val) : null;
  } catch (err) {
    logger.warn('[cache] get error:', err.message);
    return null;
  }
}

async function set(key, value, ttlSeconds) {
  try {
    const r = client();
    if (!r) return;
    await r.set(key, JSON.stringify(value), { ex: ttlSeconds });
  } catch (err) {
    logger.warn('[cache] set error:', err.message);
  }
}

// Accepts one or many keys.
async function del(...keys) {
  try {
    const r = client();
    if (!r || !keys.length) return;
    await r.del(...keys);
  } catch (err) {
    logger.warn('[cache] del error:', err.message);
  }
}

// Delete all keys matching prefix + '*'.
async function delPattern(prefix) {
  try {
    const r = client();
    if (!r) return;
    let cursor = 0;
    do {
      const [next, keys] = await r.scan(cursor, { match: `${prefix}*`, count: 100 });
      cursor = next;
      if (keys.length) await r.del(...keys);
    } while (cursor !== 0);
  } catch (err) {
    logger.warn('[cache] delPattern error:', err.message);
  }
}

// Atomically increment key by amount, then set expiry to a Unix epoch timestamp.
// Returns the new value, or null if Redis is unavailable.
async function incrby(key, amount, expireAtTimestamp) {
  try {
    const r = client();
    if (!r) return null;
    const pipeline = r.pipeline();
    pipeline.incrby(key, amount);
    if (expireAtTimestamp) pipeline.expireat(key, expireAtTimestamp);
    const results = await pipeline.exec();
    return results[0];
  } catch (err) {
    logger.warn('[cache] incrby error:', err.message);
    return null;
  }
}

module.exports = { get, set, del, delPattern, incrby };
