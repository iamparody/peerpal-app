const { query } = require('../db');

// Runs hourly. Finds users past their scheduled_deletion_at and executes a full purge.
// Blueprint section 12.1 — deletion order respects FK constraints.
// Flagged AI interactions are anonymized (user_id → null), not deleted.
async function runDeletionJob() {
  const { rows: users } = await query(
    `SELECT id FROM users WHERE scheduled_deletion_at IS NOT NULL AND scheduled_deletion_at <= NOW()`
  );

  for (const { id } of users) {
    // Step 1: Anonymize flagged ai_interactions — retained for safety audit trail
    await query(
      `UPDATE ai_interactions SET user_id = NULL WHERE user_id = $1 AND flagged = true`,
      [id]
    );

    // Step 2: Delete non-flagged ai_interactions (flagged ones now have user_id=null)
    await query('DELETE FROM ai_interactions WHERE user_id = $1', [id]);

    // Step 3: Delete sessions (RESTRICT on user_id — must delete before user).
    // Deleting sessions cascades SET NULL to: ai_interactions.session_id,
    // credit_transactions.session_id, feedback.session_id, peer_requests.session_id.
    await query('DELETE FROM sessions WHERE user_id = $1', [id]);

    // Step 4: Delete peer_requests (RESTRICT on user_id — must delete before user)
    await query('DELETE FROM peer_requests WHERE user_id = $1', [id]);

    // Step 5: Delete peer_requests where this user was the responder
    await query('DELETE FROM peer_requests WHERE accepted_by = $1', [id]);

    // Step 6: Delete escalation/emergency logs for this user
    await query('DELETE FROM escalation_logs WHERE user_id = $1', [id]);
    await query('DELETE FROM emergency_logs  WHERE user_id = $1', [id]);

    // Step 7: Delete group activity
    await query('DELETE FROM group_reports     WHERE reported_user_id = $1 OR reported_by = $1', [id]);
    await query('DELETE FROM group_bans        WHERE user_id = $1', [id]);
    await query('DELETE FROM group_messages    WHERE user_id = $1', [id]);
    await query('DELETE FROM group_memberships WHERE user_id = $1', [id]);

    // Step 8: Delete personal data (all CASCADE on user_id — explicit for clarity)
    await query('DELETE FROM journals            WHERE user_id = $1', [id]);
    await query('DELETE FROM moods               WHERE user_id = $1', [id]);
    // therapist_referrals dropped in Phase 37 teardown.
    // therapist_bookings.member_user_id → ON DELETE SET NULL (financial records preserved, member anonymised)
    // therapist_ratings.member_user_id  → ON DELETE SET NULL (ratings preserved anonymously)
    // therapy_disputes.raised_by        → ON DELETE SET NULL (dispute records preserved for audit)
    await query('DELETE FROM safety_plans        WHERE user_id = $1', [id]);
    await query('DELETE FROM notifications       WHERE user_id = $1', [id]);
    await query('DELETE FROM credit_transactions WHERE user_id = $1', [id]);
    await query('DELETE FROM credits             WHERE user_id = $1', [id]);
    await query('DELETE FROM ai_personas         WHERE user_id = $1', [id]);

    // Step 9: Notify admins before deleting the user record
    await query(
      `INSERT INTO notifications (user_id, type, payload, channel)
       SELECT aid, 'data_deletion_confirmed', $1, 'in_app'
         FROM (SELECT id AS aid FROM users WHERE role = 'admin' AND is_active = true) admins`,
      [JSON.stringify({ source: 'deletion_job', deleted_at: new Date().toISOString() })]
    );

    // Step 10: Delete the user
    await query('DELETE FROM users WHERE id = $1', [id]);

  }
}

module.exports = { runDeletionJob };
