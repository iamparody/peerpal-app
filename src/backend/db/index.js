require('dotenv').config();
const { Pool } = require('pg');

const isProd = process.env.NODE_ENV === 'production';

const pool = new Pool({
  connectionString: process.env.DATABASE_POOLER_URL || process.env.DATABASE_URL,
  ssl: isProd ? { rejectUnauthorized: true } : false,
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: isProd ? 5000 : 2000,
});

pool.on('error', (err) => {
  // Log but don't exit — a single bad idle client shouldn't bring down the server.
  // The pool will remove the client and open a fresh one on the next query.
  console.error('[pg-pool] Unexpected client error', err.message);
});

const SLOW_QUERY_MS = 500;

async function query(text, params) {
  const start = Date.now();
  const res = await pool.query(text, params);
  const duration = Date.now() - start;
  if (process.env.NODE_ENV === 'development') {
    console.log('query', { text: text.slice(0, 80), duration, rows: res.rowCount });
  } else if (duration > SLOW_QUERY_MS) {
    console.warn('[slow-query]', { duration, query: text.slice(0, 120) });
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
