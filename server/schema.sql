-- Run this once against your Postgres database to set up the schema.
-- psql $DATABASE_URL -f schema.sql

-- ── Users (for authentication) ────────────────────────────────
CREATE TABLE IF NOT EXISTS users (
  id            SERIAL PRIMARY KEY,
  email         TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  name          TEXT NOT NULL DEFAULT '',
  role          TEXT NOT NULL DEFAULT 'agent',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── Sessions (managed by connect-pg-simple) ──────────────────
CREATE TABLE IF NOT EXISTS sessions (
  sid    TEXT PRIMARY KEY,
  sess   JSONB NOT NULL,
  expire TIMESTAMPTZ NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_sessions_expire ON sessions(expire);

-- ── Seed users (dev only) ─────────────────────────────────────
-- admin@example.com  |  Password: changeme  (role: admin)
-- Generated with: node -e "const b=require('bcryptjs'); b.hash('changeme',10).then(console.log)"
INSERT INTO users (email, password_hash, name, role)
VALUES ('admin@example.com', '$2b$10$azgKm0JSFNyGatA7OPf9euhcMtBtwo1SFDJO39rhtYm19FC8OQhWu', 'Admin', 'admin')
ON CONFLICT (email) DO NOTHING;

-- admin@company.com  |  Password: password123  (legacy dev seed)
INSERT INTO users (email, password_hash, name, role)
VALUES ('admin@company.com', '$2b$12$3mlWRa9mVug3nCkbmsNbQ.OjyYG6cQOlmtCMT6DGeKwDu24tNyXf.', 'Admin', 'admin')
ON CONFLICT (email) DO NOTHING;

CREATE TABLE IF NOT EXISTS tickets (
  id             SERIAL PRIMARY KEY,
  ticket_ref     TEXT NOT NULL UNIQUE,          -- e.g. "TKT-001"
  subject        TEXT NOT NULL,
  customer_email TEXT NOT NULL,
  category       TEXT NOT NULL DEFAULT 'General',
  priority       TEXT NOT NULL DEFAULT 'low'    CHECK (priority IN ('low','medium','high','urgent')),
  status         TEXT NOT NULL DEFAULT 'open'   CHECK (status IN ('open','pending','resolved','closed')),
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS messages (
  id         SERIAL PRIMARY KEY,
  ticket_id  INTEGER NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
  from_addr  TEXT NOT NULL,
  body       TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS messages_ticket_id_idx ON messages(ticket_id);

-- ── Sample data (mirrors the in-memory seed) ─────────────────
INSERT INTO tickets (ticket_ref, subject, customer_email, category, priority, status, created_at)
VALUES
  ('TKT-001', 'Unable to reset password',        'alice@example.com', 'Account',         'high',   'open',     '2026-03-24T09:15:00Z'),
  ('TKT-002', 'Billing charge not matching invoice', 'bob@example.com', 'Billing',        'urgent', 'pending',  '2026-03-25T14:02:00Z'),
  ('TKT-003', 'Feature request: dark mode',       'carol@example.com', 'Feature Request', 'low',    'resolved', '2026-03-20T11:45:00Z')
ON CONFLICT (ticket_ref) DO NOTHING;

INSERT INTO messages (ticket_id, from_addr, body, created_at)
VALUES
  (1, 'alice@example.com',   'I''ve been trying to reset my password for the past hour but I''m not receiving the email.',     '2026-03-24T09:15:00Z'),
  (1, 'support@company.com', 'Hi Alice, sorry to hear that! Can you confirm the email address on your account?',              '2026-03-24T09:32:00Z'),
  (2, 'bob@example.com',     'My last invoice says $49 but my card was charged $59. Please investigate.',                     '2026-03-25T14:02:00Z'),
  (3, 'carol@example.com',   'Would love to see a dark mode option in the dashboard.',                                        '2026-03-20T11:45:00Z'),
  (3, 'support@company.com', 'Great suggestion! Dark mode is already on our roadmap for Q2. We''ll notify you when it''s live.', '2026-03-20T13:10:00Z')
ON CONFLICT DO NOTHING;

-- ── Settings (runtime-configurable key/value store) ───────────
-- Storing settings in the DB (rather than env vars) means they can be
-- changed at runtime by admins without a redeploy or server restart.
CREATE TABLE IF NOT EXISTS settings (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

-- Seed the minimum password length policy.
-- '10' is the hard floor — the PATCH /api/settings route refuses to go lower.
-- ON CONFLICT DO NOTHING so re-running schema.sql doesn't reset a value an
-- admin has already changed.
INSERT INTO settings (key, value)
VALUES ('min_password_length', '10')
ON CONFLICT (key) DO NOTHING;

-- ── Migration: ticket assignment ──────────────────────────────
-- Run once against an existing database. schema.sql is idempotent:
-- IF NOT EXISTS means re-running the full file is safe.
--
-- ON DELETE SET NULL: when an agent/admin user is deleted their tickets
-- become unassigned rather than being deleted (CASCADE) or blocking the
-- user deletion (RESTRICT). Unassigned tickets are a recoverable state;
-- deleted tickets are not.
ALTER TABLE tickets
  ADD COLUMN IF NOT EXISTS assigned_to INTEGER REFERENCES users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_tickets_assigned_to ON tickets(assigned_to);

-- ── Migration: customer contact fields + resolution ───────────
-- phone and company are nullable — existing tickets simply show "—" in the UI.
-- resolution stores the agent's close-out summary text (also nullable).
ALTER TABLE tickets ADD COLUMN IF NOT EXISTS phone      VARCHAR(50);
ALTER TABLE tickets ADD COLUMN IF NOT EXISTS company    VARCHAR(255);
ALTER TABLE tickets ADD COLUMN IF NOT EXISTS resolution TEXT;

-- ── Migration: message type discriminator ─────────────────────
-- 'message' = customer-facing communication (existing rows, default)
-- 'note'    = internal agent-only note (new)
-- DEFAULT 'message' means this migration is safe against existing rows:
-- every row that was inserted without a type is treated as a regular message.
ALTER TABLE messages ADD COLUMN IF NOT EXISTS type VARCHAR(20) NOT NULL DEFAULT 'message';
