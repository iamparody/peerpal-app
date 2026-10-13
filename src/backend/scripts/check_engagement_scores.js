'use strict';

/**
 * Runs updateEngagementSegments() against the live DB and prints a distribution summary.
 * Usage: node src/backend/scripts/check_engagement_scores.js
 */

const { updateEngagementSegments } = require('../ai/engagementScore');
const { query } = require('../db');

async function main() {
  console.log('Computing engagement scores for all active members...\n');
  await updateEngagementSegments();

  const { rows } = await query(
    `SELECT engagement_segment, COUNT(*) AS cnt
     FROM users
     WHERE role = 'member' AND is_active = true AND engagement_segment IS NOT NULL
     GROUP BY engagement_segment
     ORDER BY cnt DESC`
  );

  console.log('\nSegment distribution:');
  for (const row of rows) {
    console.log(`  ${String(row.engagement_segment).padEnd(10)} ${row.cnt} users`);
  }

  const { rows: sample } = await query(
    `SELECT id, engagement_score, engagement_segment
     FROM users
     WHERE role = 'member' AND is_active = true AND engagement_segment IS NOT NULL
     ORDER BY engagement_score DESC
     LIMIT 10`
  );
  console.log('\nTop 10 by score:');
  for (const r of sample) {
    console.log(`  score=${String(r.engagement_score).padStart(3)}  segment=${r.engagement_segment.padEnd(10)}  id=${r.id}`);
  }

  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
