-- Migration 115: Trusted Contacts (Safety Plan Extension)
-- One user invites another to be a trusted contact; linked contacts receive
-- opt-in push alerts for low mood and no-peer-found events.

CREATE TABLE trusted_contacts (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          UUID        NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  contact_user_id  UUID        NULL     REFERENCES users (id) ON DELETE SET NULL,
  token            VARCHAR(64) UNIQUE NULL,
  status           VARCHAR(10) NOT NULL DEFAULT 'pending'
                               CHECK (status IN ('pending','accepted','revoked')),
  mood_alerts      BOOLEAN     NOT NULL DEFAULT false,
  mood_threshold   SMALLINT    NOT NULL DEFAULT 1 CHECK (mood_threshold IN (1,2)),
  no_peer_alerts   BOOLEAN     NOT NULL DEFAULT false,
  created_at       TIMESTAMP   NOT NULL DEFAULT NOW(),
  accepted_at      TIMESTAMP   NULL,
  updated_at       TIMESTAMP   NOT NULL DEFAULT NOW()
);

-- Prevent duplicate active links between the same pair
CREATE UNIQUE INDEX idx_trusted_contacts_pair
  ON trusted_contacts (user_id, contact_user_id)
  WHERE contact_user_id IS NOT NULL AND status != 'revoked';

-- Fast lookup of incoming requests for a given user
CREATE INDEX idx_trusted_contacts_contact_user
  ON trusted_contacts (contact_user_id)
  WHERE status = 'pending';

-- New notification types
ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'trusted_contact_request';
ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'trusted_contact_accepted';
ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'trusted_contact_mood_alert';
ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'trusted_contact_no_peer_alert';
