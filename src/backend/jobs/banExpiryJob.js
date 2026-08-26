const { query } = require('../db');

// Runs hourly. Lifts group bans whose expires_at has passed.
// Restores membership to 'active' and notifies the user.
async function runBanExpiryJob() {
  const { rows } = await query(
    `UPDATE group_memberships gm
     SET status = 'active'
     FROM group_bans gb
     WHERE gb.group_id = gm.group_id
       AND gb.user_id  = gm.user_id
       AND gb.expires_at IS NOT NULL
       AND gb.expires_at <= NOW()
       AND gm.status = 'banned'
     RETURNING gm.user_id, gm.group_id,
               (SELECT name FROM groups WHERE id = gm.group_id) AS group_name`
  );

  for (const { user_id, group_name } of rows) {
    await query(
      `INSERT INTO notifications (user_id, type, payload, channel)
       VALUES ($1, 'account_notice', $2, 'in_app')`,
      [user_id, JSON.stringify({
        message: `Your temporary ban from the ${group_name} group has expired. You can now participate again.`,
      })]
    );
  }

  if (rows.length) {
    console.log(`[banExpiryJob] Lifted ${rows.length} expired ban(s).`);
  }
}

module.exports = { runBanExpiryJob };
