const { query } = require('../db');

// Imported lazily to avoid circular-require at module load time.
function getPeerRouting() {
  return require('../routes/peer');
}

// Runs every 2 minutes via server.js cron.
// Catches requests whose in-process setTimeout was lost due to a server restart
// or Render free-tier sleep cycle.
async function runRoutingJob() {
  const { broadenToGeneralTier, noMorePeers } = getPeerRouting();

  // ── Tier-2 broaden: open requests past broaden_at with no tier2 audit yet ──
  const { rows: toBroaden } = await query(
    `SELECT id, user_id
     FROM peer_requests
     WHERE status = 'open'
       AND broaden_at IS NOT NULL
       AND broaden_at <= NOW()
       AND routing_audit::text NOT LIKE '%tier2_broadcast%'`
  );

  for (const { id, user_id } of toBroaden) {
    try { await broadenToGeneralTier(id, user_id); }
    catch (e) { console.error(`[routingJob] broaden ${id}:`, e.message); }
  }

  // ── No-peer escalation: open requests past escalate_at ────────────────────
  const { rows: toEscalate } = await query(
    `SELECT id, user_id
     FROM peer_requests
     WHERE status = 'open'
       AND escalate_at IS NOT NULL
       AND escalate_at <= NOW()`
  );

  for (const { id, user_id } of toEscalate) {
    try { await noMorePeers(id, user_id); }
    catch (e) { console.error(`[routingJob] escalate ${id}:`, e.message); }
  }

  if (toBroaden.length || toEscalate.length) {
    console.log(`[routingJob] broadened=${toBroaden.length} escalated=${toEscalate.length}`);
  }
}

module.exports = { runRoutingJob };
