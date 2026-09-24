DELETE FROM platform_config WHERE key IN (
  'therapist_platform_fee_pct',
  'therapist_booking_credit_cost',
  'therapist_no_show_grace_minutes',
  'therapist_member_no_show_grace_minutes',
  'therapist_dispute_window_hours',
  'payout_hold_hours'
);
