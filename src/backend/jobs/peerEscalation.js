const { query } = require('../db');
const { refundCredit } = require('../utils/creditDeductor');

// Called after 90s if no member accepts the peer request.
// Checks current status before acting — safe to call even if already accepted (no-op).
async function escalatePeerRequest(request_id) {
  const { rows } = await query(
    'SELECT status, user_id, channel_preference FROM peer_requests WHERE id = $1',
    [request_id]
  );
  if (!rows.length || rows[0].status !== 'open') return;

  const { user_id, channel_preference } = rows[0];

  await query(
    `UPDATE peer_requests
        SET status = 'escalated', escalated_at = NOW(), updated_at = NOW()
      WHERE id = $1`,
    [request_id]
  );

  // Refund the credits that were deducted at request submission
  const amount = channel_preference === 'voice' ? 2 : 1;
  const reason = `Your ${channel_preference === 'voice' ? 'voice call' : 'text chat'} request expired — no peer was available. ${amount} credit${amount > 1 ? 's' : ''} refunded.`;
  await refundCredit(user_id, amount, null, channel_preference, reason);

  // Alert all admins — push + in-app
  const payload = JSON.stringify({ request_id });
  await query(
    `INSERT INTO notifications (user_id, type, payload, channel)
     SELECT id, 'peer_escalation', $1, 'push'
       FROM users WHERE role = 'admin' AND is_active = true`,
    [payload]
  );
  await query(
    `INSERT INTO notifications (user_id, type, payload, channel)
     SELECT id, 'peer_escalation', $1, 'in_app'
       FROM users WHERE role = 'admin' AND is_active = true`,
    [payload]
  );
}

module.exports = { escalatePeerRequest };
