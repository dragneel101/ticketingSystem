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

-- ── Migration: ticket audit trail ────────────────────────────
-- ticket_events is an append-only log of meaningful state transitions.
-- Never update or delete rows — immutability is what makes an audit trail trustworthy.
--
-- actor_name / actor_email are denormalized snapshots intentionally:
--   If we only stored actor_id and joined users at read time, events written
--   by a user who was later deleted would lose their "who" entirely.
--   Snapshotting at write time makes each event self-contained.
--
-- ON DELETE CASCADE on ticket_id: when the ticket is deleted its history
--   has no referent — cascading is correct here. This mirrors messages.
--   (Compare: assigned_to on tickets uses SET NULL because an unassigned
--   ticket is still meaningful; a history row without a ticket is not.)
CREATE TABLE IF NOT EXISTS ticket_events (
  id          SERIAL PRIMARY KEY,
  ticket_id   INTEGER NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
  actor_id    INTEGER REFERENCES users(id) ON DELETE SET NULL,
  actor_name  TEXT,                    -- snapshot so events survive user deletion
  actor_email TEXT,
  event_type  VARCHAR(50) NOT NULL,    -- see values below
  from_value  TEXT,                    -- previous value (null for initial/unassigned)
  to_value    TEXT,                    -- new value
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
  -- event_type values:
  --   'status_changed'   — status field changed
  --   'priority_changed' — priority field changed
  --   'assigned'         — assigned_to set to a user (to_value = assignee name)
  --   'unassigned'       — assigned_to cleared (from_value = previous assignee name)
  --   'resolution_set'   — resolution text was set (was null/empty, now has content)
);

CREATE INDEX IF NOT EXISTS idx_ticket_events_ticket_id ON ticket_events(ticket_id);

-- ── Migration: atomic ticket ref sequence ────────────────────
-- Replaces the in-app max+increment approach, which has a race condition
-- under concurrent POSTs (two transactions can read the same max before
-- either commits). nextval() is atomic by design — Postgres guarantees
-- each caller gets a distinct value even under concurrency.
CREATE SEQUENCE IF NOT EXISTS ticket_ref_seq;

-- Advance the sequence past any refs already in the table so the first
-- nextval() call doesn't collide with seed/existing data.
-- setval(..., false) sets the sequence's last_value without consuming it,
-- meaning the next nextval() call returns exactly that value.
-- The GREATEST(..., 0) guard handles an empty table (MAX returns NULL).
DO $$
BEGIN
  PERFORM setval(
    'ticket_ref_seq',
    GREATEST(
      (SELECT MAX(CAST(REPLACE(ticket_ref, 'TKT-', '') AS INTEGER)) FROM tickets),
      0
    ),
    false
  );
END $$;

-- ── Migration: customer_name on tickets ──────────────────
-- Stores the customer's display name alongside their email so tickets
-- show a human name without requiring a customer record to exist.
ALTER TABLE tickets ADD COLUMN IF NOT EXISTS customer_name VARCHAR(255);

-- ── Migration: customers ──────────────────────────────────
-- A customer record represents a real person who submits tickets.
-- email is UNIQUE because it's our join key to tickets.customer_email —
-- one record per contact, not per ticket. phone and company are nullable
-- since many contacts are individuals without a company affiliation.
-- notes is a free-text field for agents to record context about this customer.
CREATE TABLE IF NOT EXISTS customers (
  id         SERIAL PRIMARY KEY,
  name       VARCHAR(255) NOT NULL,
  email      VARCHAR(255) UNIQUE NOT NULL,
  phone      VARCHAR(50),
  company    VARCHAR(255),
  notes      TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ── Migration: companies ──────────────────────────────────
-- Companies are first-class entities with structured fields.
-- address, primary_contact, phone are all nullable — some companies
-- may be created from a ticket before full details are known.
-- name is UNIQUE so duplicate companies can't be created accidentally.
CREATE TABLE IF NOT EXISTS companies (
  id              SERIAL PRIMARY KEY,
  name            VARCHAR(255) NOT NULL UNIQUE,
  address         TEXT,
  primary_contact VARCHAR(255),
  phone           VARCHAR(50),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- FK links on customers and tickets — nullable so existing rows and
-- tickets filed without a known company are unaffected.
-- ON DELETE SET NULL: deleting a company orphans the FK to null but
-- keeps the company text column for display — no data loss.
ALTER TABLE customers ADD COLUMN IF NOT EXISTS company_id INTEGER REFERENCES companies(id) ON DELETE SET NULL;
ALTER TABLE tickets   ADD COLUMN IF NOT EXISTS company_id INTEGER REFERENCES companies(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_customers_company_id ON customers(company_id);
CREATE INDEX IF NOT EXISTS idx_tickets_company_id   ON tickets(company_id);

-- ── Migration: SLA policies ───────────────────────────────────
-- One row per named policy. Times are stored as minutes so deadline
-- arithmetic is simple: base_time + minutes * 60_000 ms in JS.
-- is_default: exactly one row should be TRUE at any time — enforced
-- in application logic (transactional swap) rather than a DB constraint
-- so re-running this migration on an existing DB is safe.
CREATE TABLE IF NOT EXISTS sla_policies (
  id                        SERIAL PRIMARY KEY,
  name                      VARCHAR(255) NOT NULL UNIQUE,
  -- Per-priority first-response targets (NULL = no SLA for that priority)
  response_low_minutes      INTEGER,
  response_medium_minutes   INTEGER,
  response_high_minutes     INTEGER,
  response_urgent_minutes   INTEGER,
  -- Per-priority resolution targets
  resolution_low_minutes    INTEGER,
  resolution_medium_minutes INTEGER,
  resolution_high_minutes   INTEGER,
  resolution_urgent_minutes INTEGER,
  is_default                BOOLEAN NOT NULL DEFAULT FALSE,
  created_at                TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Seed a sensible default policy (response: 24h/8h/4h/1h; resolution: 7d/2d/1d/8h)
INSERT INTO sla_policies (
  name, is_default,
  response_low_minutes, response_medium_minutes, response_high_minutes, response_urgent_minutes,
  resolution_low_minutes, resolution_medium_minutes, resolution_high_minutes, resolution_urgent_minutes
) VALUES (
  'Default SLA', TRUE,
  1440, 480, 240, 60,
  10080, 2880, 1440, 480
) ON CONFLICT (name) DO NOTHING;

-- Link companies to a custom SLA policy (null = use the default policy)
ALTER TABLE companies
  ADD COLUMN IF NOT EXISTS sla_policy_id INTEGER REFERENCES sla_policies(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_companies_sla_policy_id ON companies(sla_policy_id);

-- SLA deadline columns on tickets — nullable so pre-migration tickets show
-- "no SLA" in the UI rather than appearing as permanently breached.
ALTER TABLE tickets ADD COLUMN IF NOT EXISTS first_response_due_at TIMESTAMPTZ;
ALTER TABLE tickets ADD COLUMN IF NOT EXISTS resolution_due_at     TIMESTAMPTZ;

-- Partial indexes only cover rows that have deadlines (the common query path).
CREATE INDEX IF NOT EXISTS idx_tickets_first_response_due_at
  ON tickets(first_response_due_at) WHERE first_response_due_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_tickets_resolution_due_at
  ON tickets(resolution_due_at) WHERE resolution_due_at IS NOT NULL;

-- ── Migration: expanded ticket status workflow ────────────────────
-- Replaces the original 4-value CHECK with a 9-status workflow set.
-- Legacy values (open, pending) are retained in the constraint so existing
-- rows remain valid — they can be migrated to the new statuses separately.
ALTER TABLE tickets DROP CONSTRAINT IF EXISTS tickets_status_check;
ALTER TABLE tickets ADD CONSTRAINT tickets_status_check
  CHECK (status IN (
    'open', 'pending',                        -- legacy (kept for existing data)
    'unassigned', 'assigned', 'in-progress',
    'requesting-escalation',
    'pending-client', 'pending-vendor',
    'scheduled', 'resolved', 'closed'
  ));

-- New tickets start as 'unassigned' (previously 'open').
ALTER TABLE tickets ALTER COLUMN status SET DEFAULT 'unassigned';
