-- Migration 067: Group reactions and polls

-- One reaction per user per message (toggle model: same emoji = remove, different = switch)
CREATE TABLE group_reactions (
  id         UUID      PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id UUID      NOT NULL REFERENCES group_messages(id) ON DELETE CASCADE,
  user_id    UUID      NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  emoji      TEXT      NOT NULL CHECK (emoji IN ('heart', 'hug', 'strong', 'spark', 'relate')),
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  UNIQUE (message_id, user_id)
);

CREATE INDEX idx_group_reactions_message ON group_reactions (message_id);

-- Polls (separate from group_messages — structured data doesn't fit flat text)
CREATE TABLE group_polls (
  id                UUID      PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id          UUID      NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  posted_by         UUID      NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  question          TEXT      NOT NULL,
  is_active         BOOLEAN   NOT NULL DEFAULT true,
  min_votes_to_show INT       NOT NULL DEFAULT 5,
  created_at        TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_group_polls_active ON group_polls (group_id, is_active, created_at DESC);

CREATE TABLE group_poll_options (
  id       UUID     PRIMARY KEY DEFAULT gen_random_uuid(),
  poll_id  UUID     NOT NULL REFERENCES group_polls(id) ON DELETE CASCADE,
  label    TEXT     NOT NULL,
  position SMALLINT NOT NULL
);

CREATE INDEX idx_group_poll_options_poll ON group_poll_options (poll_id, position);

CREATE TABLE group_poll_votes (
  id         UUID      PRIMARY KEY DEFAULT gen_random_uuid(),
  poll_id    UUID      NOT NULL REFERENCES group_polls(id) ON DELETE CASCADE,
  option_id  UUID      NOT NULL REFERENCES group_poll_options(id) ON DELETE CASCADE,
  user_id    UUID      NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  UNIQUE (poll_id, user_id)
);

CREATE INDEX idx_group_poll_votes_poll ON group_poll_votes (poll_id);
