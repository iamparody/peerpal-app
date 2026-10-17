require('dotenv').config();
const { Pool } = require('pg');
const logger = require('../utils/logger');

const isProd = process.env.NODE_ENV === 'production';

const connStr = process.env.DATABASE_POOLER_URL || process.env.DATABASE_URL;
const needsSsl = connStr && connStr.includes('supabase.com');

const pool = new Pool({
  connectionString: connStr,
  ssl: needsSsl ? { rejectUnauthorized: false } : (isProd ? { rejectUnauthorized: true } : false),
  max: 10,                        // Supabase free = 60 connections; 10 per instance leaves headroom for two instances + migrations
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: isProd ? 5000 : 2000,
});

pool.on('error', (err) => {
  logger.error({ err }, '[pg-pool] Unexpected client error');
});

// Alert Sentry when pool is saturated (waitingCount > 3) for more than 30 s
let _saturatedSince = null;
setInterval(() => {
  const waiting = pool.waitingCount;
  if (waiting > 3) {
    if (!_saturatedSince) {
      _saturatedSince = Date.now();
    } else if (Date.now() - _saturatedSince >= 30000) {
      try {
        const { Sentry } = require('../services/sentry');
        Sentry.captureMessage(`[pg-pool] saturated: waitingCount=${waiting} for >30s`, 'warning');
      } catch {}
      _saturatedSince = null; // reset so we don't spam — next alert after another 30 s window
    }
  } else {
    _saturatedSince = null;
  }
}, 5000);

const SLOW_QUERY_MS = 1500;

async function query(text, params) {
  const start = Date.now();
  const res = await pool.query(text, params);
  const duration = Date.now() - start;
  if (process.env.NODE_ENV === 'development') {
    logger.debug({ sql: text.slice(0, 80), duration_ms: duration, rows: res.rowCount }, 'query');
  } else if (duration > SLOW_QUERY_MS) {
    logger.warn({ duration_ms: duration, sql: text.slice(0, 120) }, 'slow query');
  }
  return res;
}

function poolMetrics() {
  return {
    total:   pool.totalCount,
    idle:    pool.idleCount,
    waiting: pool.waitingCount,
  };
}

async function getClient() {
  return pool.connect();
}

// Wraps fn(client) in BEGIN/COMMIT/ROLLBACK. Releases the client on exit.
// Throws on either the fn body or the COMMIT — caller handles.
async function transaction(fn) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

module.exports = { query, getClient, transaction, pool, poolMetrics };
