'use strict';

/**
 * Peer-request push outcome report (read-only). docs/peer-request-push.md
 *
 * For every peer request in the window: was at least one peer pushed, and was it matched?
 * The outcome this feature moves: match rate, overall and at night.
 *
 * Usage: node scripts/peer_push_report.js [days=14]   (from src/backend)
 */

const QUIET_START = 22;
const QUIET_END = 7;

// Pure: rows [{ created_hour_eat, pushed, matched }] → summary. Tested in tests/peerRequestPush.test.js.
function summarize(rows) {
  const bucket = () => ({ requests: 0, pushed: 0, matched: 0, matchedWhenPushed: 0, matchedWhenNotPushed: 0 });
  const out = { all: bucket(), day: bucket(), night: bucket() };
  for (const r of rows) {
    const h = Number(r.created_hour_eat);
    const night = h >= QUIET_START || h < QUIET_END;
    for (const b of [out.all, night ? out.night : out.day]) {
      b.requests += 1;
      if (r.pushed) b.pushed += 1;
      if (r.matched) b.matched += 1;
      if (r.matched && r.pushed) b.matchedWhenPushed += 1;
      if (r.matched && !r.pushed) b.matchedWhenNotPushed += 1;
    }
  }
  const pct = (n, d) => (d ? Math.round((n / d) * 1000) / 10 : null);
  for (const b of Object.values(out)) {
    b.pushReachPct = pct(b.pushed, b.requests);
    b.matchRatePct = pct(b.matched, b.requests);
    b.matchRateWhenPushedPct = pct(b.matchedWhenPushed, b.pushed);
    b.matchRateWhenNotPushedPct = pct(b.matchedWhenNotPushed, b.requests - b.pushed);
  }
  return out;
}

const REPORT_SQL = `
  SELECT
    EXTRACT(HOUR FROM pr.created_at + INTERVAL '3 hours')::int AS created_hour_eat,
    EXISTS (
      SELECT 1 FROM notifications n
      WHERE n.type = 'peer_request_broadcast' AND n.channel = 'push'
        AND n.payload::jsonb->>'request_id' = pr.id::text
    ) AS pushed,
    (pr.accepted_by IS NOT NULL) AS matched
  FROM peer_requests pr
  WHERE pr.created_at > NOW() - ($1 || ' days')::interval`;

async function main() {
  const days = Math.max(1, parseInt(process.argv[2], 10) || 14);
  const { query } = require('../db');
  const { rows } = await query(REPORT_SQL, [String(days)]);
  const s = summarize(rows);
  console.log(`Peer-request push report, last ${days} days\n`);
  console.log('segment  requests  push_reach  match_rate  match|pushed  match|not_pushed');
  for (const [name, b] of Object.entries(s)) {
    const f = (v) => (v === null ? '-' : `${v}%`).padStart(10);
    console.log(`${name.padEnd(7)} ${String(b.requests).padStart(9)} ${f(b.pushReachPct)}  ${f(b.matchRatePct)}  ${f(b.matchRateWhenPushedPct)}  ${f(b.matchRateWhenNotPushedPct)}`);
  }
  process.exit(0);
}

if (require.main === module) {
  main().catch((err) => { console.error(err); process.exit(1); });
}

module.exports = { summarize, REPORT_SQL };
