'use strict';

const { query } = require('../db');
const { issueFullRefund } = require('../utils/therapyRefund');
const { refundCredit } = require('../utils/creditDeductor');

async function notifyUser(user_id, type, payload) {
  await query(
    `INSERT INTO notifications (user_id, type, payload, channel)
     VALUES ($1, $2, $3, 'in_app')`,
    [user_id, type, JSON.stringify(payload)]
  ).catch((e) => console.error('[preSessionCheckin:notify]', e.message));
}

async function runPreSessionCheckinJob() {
  // Confirmed bookings starting in 29–31 minutes that haven't had a checkin sent
  const { rows } = await query(
    `SELECT b.id, b.member_user_id, b.therapist_id, b.credit_charged
     FROM therapist_bookings b
     WHERE b.status = 'confirmed'
       AND b.scheduled_at BETWEEN NOW() + INTERVAL '29 minutes' AND NOW() + INTERVAL '31 minutes'
       AND b.pre_session_checkin IS NULL`
  );

  for (const row of rows) {
    try {
      // Send 5-question mood + safety checkin as in-app notification
      // Member response stored via PATCH /therapy/bookings/:id/checkin (handled by notification action)
      await notifyUser(row.member_user_id, 'therapist_update', {
        message: 'Your therapy session starts in 30 minutes. How are you feeling right now?',
        booking_id: row.id,
        checkin: true,
        questions: [
          { id: 'mood', text: 'How is your mood right now?', scale: 5 },
          { id: 'anxiety', text: 'How anxious are you feeling?', scale: 5 },
          { id: 'safety', text: 'Are you feeling safe?', type: 'boolean' },
          { id: 'topic', text: 'What would you most like to focus on today?', type: 'text' },
          { id: 'readiness', text: 'How ready do you feel for this session?', scale: 5 },
        ],
      });

      // Mark checkin as sent (null → JSON with sent timestamp; actual responses stored on receipt)
      await query(
        `UPDATE therapist_bookings SET pre_session_checkin = $1, updated_at = NOW() WHERE id = $2`,
        [JSON.stringify({ sent_at: new Date().toISOString(), responses: null }), row.id]
      );

      console.log(`[preSessionCheckin] Checkin sent for booking ${row.id}`);
    } catch (err) {
      console.error('[preSessionCheckin] Error:', row.id, err.message);
    }
  }
}

// Called by notification response handler when member submits checkin
async function processCheckinResponse(booking_id, responses) {
  const crisisScore = responses?.safety === false ? 1 : (responses?.mood ?? 5);

  if (crisisScore === 1 || responses?.safety === false) {
    const { rows } = await query(
      'SELECT member_user_id, therapist_id, credit_charged FROM therapist_bookings WHERE id = $1',
      [booking_id]
    );
    if (!rows.length) return;
    const b = rows[0];

    await query(
      `UPDATE therapist_bookings
       SET status = 'cancelled', cancellation_reason = 'crisis_detected', updated_at = NOW()
       WHERE id = $1`,
      [booking_id]
    );

    if (b.credit_charged > 0) {
      await refundCredit(b.member_user_id, b.credit_charged, booking_id, 'crisis_detected').catch(
        (e) => console.error('[preSessionCheckin.crisis] refund credit:', e.message)
      );
    }

    await issueFullRefund(booking_id).catch(
      (e) => console.error('[preSessionCheckin.crisis] refund mpesa:', e.message)
    );

    await notifyUser(b.member_user_id, 'emergency', {
      message: 'We noticed you may be in distress. A session has been paused. If you are in crisis, please call Befrienders Kenya: 0800 723 253 (free, 24/7).',
      befrienders: '0800 723 253',
    });

    console.warn('[preSessionCheckin] Crisis detected — booking cancelled:', booking_id);
  } else {
    await query(
      `UPDATE therapist_bookings
       SET pre_session_checkin = $1, updated_at = NOW()
       WHERE id = $2`,
      [JSON.stringify({ ...responses, responded_at: new Date().toISOString() }), booking_id]
    );
  }
}

module.exports = { runPreSessionCheckinJob, processCheckinResponse };
