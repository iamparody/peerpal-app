require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_DIRECT_URL || process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
});

const MIGRATIONS_DIR = path.join(__dirname);

async function run() {
  const client = await pool.connect();

  try {
    // Create migration tracking table if it doesn't exist
    await client.query(`
      CREATE TABLE IF NOT EXISTS migrations_log (
        id SERIAL PRIMARY KEY,
        filename VARCHAR(255) UNIQUE NOT NULL,
        applied_at TIMESTAMP DEFAULT NOW()
      )
    `);

    // Get list of already-applied migrations
    const { rows: applied } = await client.query(
      'SELECT filename FROM migrations_log ORDER BY filename'
    );
    const appliedSet = new Set(applied.map((r) => r.filename));

    // Read forward migration files only (exclude _rollback.sql files)
    const files = fs
      .readdirSync(MIGRATIONS_DIR)
      .filter((f) => f.endsWith('.sql') && !f.includes('_rollback'))
      .sort();

    if (files.length === 0) {
      console.log('No migration files found.');
      return;
    }

    let appliedCount = 0;
    let skippedCount = 0;

    for (const file of files) {
      if (appliedSet.has(file)) {
        console.log(`  SKIP  ${file}`);
        skippedCount++;
        continue;
      }

      const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, file), 'utf8');

      try {
        await client.query('BEGIN');
        await client.query(sql);
        await client.query('INSERT INTO migrations_log (filename) VALUES ($1)', [file]);
        await client.query('COMMIT');
        console.log(`  OK    ${file}`);
        appliedCount++;
      } catch (err) {
        await client.query('ROLLBACK');
        console.error(`  FAIL  ${file}: ${err.message}`);
        process.exit(1);
      }
    }

    console.log(`\nMigrations complete: ${appliedCount} applied, ${skippedCount} skipped.`);
  } finally {
    client.release();
    await pool.end();
  }
}

run().catch((err) => {
  console.error('Migration runner error:', err);
  process.exit(1);
});
