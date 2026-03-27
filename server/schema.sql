-- Run this once against your Postgres database to set up the schema.
-- psql $DATABASE_URL -f schema.sql

-- ── Users (for authentication) ────────────────────────────────
CREATE TABLE IF NOT EXISTS users (
  id            SERIAL PRIMARY KEY,
  email         TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  name          TEXT NOT NULL DEFAULT '',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── Sessions (managed by connect-pg-simple) ──────────────────
-- connect-pg-simple will create this table automatically on startup
-- when the `createTableIfMissing` option is set to true (see server/index.js).

-- ── Seed user (dev only) ──────────────────────────────────────
-- Email: admin@company.com  |  Password: password123
-- Generate a new hash with: node -e "require('bcrypt').hash('yourpass',12).then(console.log)"
-- then UPDATE users SET password_hash = '...' WHERE email = 'admin@company.com';
INSERT INTO users (email, password_hash, name)
VALUES ('admin@company.com', '$2b$12$3mlWRa9mVug3nCkbmsNbQ.OjyYG6cQOlmtCMT6DGeKwDu24tNyXf.', 'Admin')
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
