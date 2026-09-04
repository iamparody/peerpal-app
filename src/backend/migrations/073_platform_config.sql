-- Migration 073: platform_config table
-- Stores runtime-configurable values (packages, credit costs, AI economics).
-- Replaces hardcoded constants in daraja.js, peer.js, and admin stats route.

CREATE TABLE platform_config (
  key        TEXT        PRIMARY KEY,
  value      JSONB       NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO platform_config (key, value) VALUES
  ('packages', '{"standard":{"price_ksh":150,"credits":10,"ai_conversations":4,"name":"Just for now"},"plus":{"price_ksh":300,"credits":25,"ai_conversations":10,"name":"I''m committed"},"premium":{"price_ksh":500,"credits":50,"ai_conversations":20,"name":"All of me"}}'),
  ('credit_costs', '{"text":1,"voice":2,"referral":1}'),
  ('ai_cost_per_session_ksh', '2.60');
