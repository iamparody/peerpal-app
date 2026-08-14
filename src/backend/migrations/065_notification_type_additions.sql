-- Migration 065: Add missing notification_type enum values
-- peer_matching_update         — calm space routing + FCM push from noMorePeers()
-- account_notice               — session-end warnings and credit deduction alerts
-- peer_permission_inactive     — permissionInactivityJob nightly at 01:00 UTC
-- peer_permission_version_drift — versionDriftJob nightly at 02:00 UTC

ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'peer_matching_update';
ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'account_notice';
ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'peer_permission_inactive';
ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'peer_permission_version_drift';
