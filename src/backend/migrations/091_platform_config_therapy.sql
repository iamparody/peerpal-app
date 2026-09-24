-- Phase 37: therapy marketplace config keys.
-- ON CONFLICT DO NOTHING — safe to re-run; admin can update values via admin panel.
INSERT INTO platform_config (key, value) VALUES
  ('therapist_platform_fee_pct',          '20'),
  ('therapist_booking_credit_cost',        '1'),
  ('therapist_no_show_grace_minutes',     '10'),
  ('therapist_member_no_show_grace_minutes', '15'),
  ('therapist_dispute_window_hours',      '24'),
  ('payout_hold_hours',                   '24')
ON CONFLICT (key) DO NOTHING;
