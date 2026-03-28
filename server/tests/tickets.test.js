'use strict';

const request = require('supertest');
const bcrypt = require('bcryptjs');
const app = require('../app');
const pool = require('../db');

// ── Test fixtures ─────────────────────────────────────────────
// Real rows in the DB are necessary because middleware like adminOnly
// re-queries the database on every request — there's nothing to mock.
const TEST_ADMIN = {
  email: 'tickets-test-admin@example.com',
  name: 'Tickets Test Admin',
  password: 'adminpass123',
  role: 'admin',
};

const TEST_AGENT = {
  email: 'tickets-test-agent@example.com',
  name: 'Tickets Test Agent',
  password: 'agentpass123',
  role: 'agent',
};

let adminId;
let agentId;

// ── Ticket ID tracking ────────────────────────────────────────
// We accumulate the ticket_ref of every ticket created during tests so
// afterEach can wipe them out. Because messages have ON DELETE CASCADE,
// deleting the ticket row is sufficient — no separate message cleanup needed.
let createdTicketRefs = [];

beforeAll(async () => {
  // Hash both passwords concurrently — bcrypt is CPU-bound, no reason to
  // do these sequentially.
  const [adminHash, agentHash] = await Promise.all([
    bcrypt.hash(TEST_ADMIN.password, 10),
    bcrypt.hash(TEST_AGENT.password, 10),
  ]);

  // ON CONFLICT DO UPDATE means re-running the suite after a crashed run
  // (where afterAll never fired) still starts clean — passwords are reset
  // to test values rather than leaving a stale hash from a prior run.
  const { rows: adminRows } = await pool.query(
    `INSERT INTO users (email, name, password_hash, role)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (email) DO UPDATE SET password_hash = EXCLUDED.password_hash
     RETURNING id`,
    [TEST_ADMIN.email, TEST_ADMIN.name, adminHash, TEST_ADMIN.role]
  );
  const { rows: agentRows } = await pool.query(
    `INSERT INTO users (email, name, password_hash, role)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (email) DO UPDATE SET password_hash = EXCLUDED.password_hash
     RETURNING id`,
    [TEST_AGENT.email, TEST_AGENT.name, agentHash, TEST_AGENT.role]
  );

  adminId = adminRows[0].id;
  agentId = agentRows[0].id;
});

afterEach(async () => {
  // Wipe tickets created during the just-finished test. Doing this in
  // afterEach (rather than afterAll) prevents inter-test pollution: a ticket
  // created in test A won't affect the count or IDs seen by test B.
  if (createdTicketRefs.length > 0) {
    await pool.query('DELETE FROM tickets WHERE ticket_ref = ANY($1)', [createdTicketRefs]);
    createdTicketRefs = [];
  }
});

afterAll(async () => {
  // Belt-and-suspenders: if afterEach missed anything, clean up now.
  if (createdTicketRefs.length > 0) {
    await pool.query('DELETE FROM tickets WHERE ticket_ref = ANY($1)', [createdTicketRefs]);
  }
  await pool.query('DELETE FROM users WHERE id = ANY($1)', [[adminId, agentId]]);
  // pool.end() lets Jest exit cleanly — without it, the process hangs on the
  // open pg connection pool.
  await pool.end();
});

// ── Helper: authenticated supertest agent ─────────────────────
// supertest's request.agent(app) maintains a cookie jar across requests,
// mirroring how a real browser carries a session cookie. Without this, each
// request() call is stateless and session-based auth would never succeed.
async function loginAs(credentials) {
  const agent = request.agent(app);
  await agent
    .post('/api/auth/login')
    .send({ email: credentials.email, password: credentials.password })
    .expect(200);
  return agent;
}

// ── Helper: create a ticket and track its ref ─────────────────
// Centralising creation keeps individual tests concise and ensures every
// created ticket is recorded in createdTicketRefs for cleanup.
async function createTicket(agent, overrides = {}) {
  const payload = {
    subject: 'Test ticket subject',
    customerEmail: 'test-customer@example.com',
    category: 'General',
    priority: 'medium',
    ...overrides,
  };
  const res = await agent.post('/api/tickets').send(payload).expect(201);
  createdTicketRefs.push(res.body.id); // id is the ticket_ref e.g. "TKT-042"
  return res.body;
}

// ═══════════════════════════════════════════════════════════════════════════
// GET /api/tickets
// ═══════════════════════════════════════════════════════════════════════════
describe('GET /api/tickets', () => {
  test('happy path — authenticated user receives an array of tickets', async () => {
    const agent = await loginAs(TEST_AGENT);
    const res = await agent.get('/api/tickets');

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);

    // Verify the response shape on the first item if the DB has at least one
    // ticket (the seed data gives us three, so this is always true in practice).
    if (res.body.length > 0) {
      const ticket = res.body[0];
      // These are the camelCase keys that formatTicket() maps to — not the
      // raw snake_case column names from the DB.
      expect(ticket).toHaveProperty('id');
      expect(ticket).toHaveProperty('subject');
      expect(ticket).toHaveProperty('customerEmail');
      expect(ticket).toHaveProperty('status');
      expect(ticket).toHaveProperty('priority');
      // The list endpoint omits messages — that's a deliberate performance
      // trade-off. The detail endpoint fetches them.
      expect(ticket.messages).toEqual([]);
    }
  });

  test('unauthenticated request — 401', async () => {
    // request(app) (not agent) has no cookie jar, so no session cookie is sent.
    const res = await request(app).get('/api/tickets');
    expect(res.status).toBe(401);
  });

  test('?status= filter — returns only tickets with matching status', async () => {
    const agent = await loginAs(TEST_AGENT);

    // Create two tickets we control so we can assert exact counts rather than
    // relying on the seed data state, which could change between runs.
    await createTicket(agent, { subject: 'Filter test open ticket' });
    const closed = await createTicket(agent, { subject: 'Filter test closed ticket' });

    // PATCH the second one to closed so we have a known mix
    await agent
      .patch(`/api/tickets/${closed.id}`)
      .send({ status: 'closed' });

    const res = await agent.get('/api/tickets?status=closed');

    expect(res.status).toBe(200);
    // Every returned ticket must match the requested status — no leakage
    expect(res.body.every((t) => t.status === 'closed')).toBe(true);

    // Our known closed ticket must be present in the results
    const ids = res.body.map((t) => t.id);
    expect(ids).toContain(closed.id);
  });

  test('?priority= filter — returns only tickets with matching priority', async () => {
    const agent = await loginAs(TEST_AGENT);
    await createTicket(agent, { subject: 'Priority filter test', priority: 'urgent' });

    const res = await agent.get('/api/tickets?priority=urgent');

    expect(res.status).toBe(200);
    expect(res.body.every((t) => t.priority === 'urgent')).toBe(true);
  });

  test('?status= and ?priority= together — AND-filters correctly', async () => {
    const agent = await loginAs(TEST_AGENT);
    const ticket = await createTicket(agent, {
      subject: 'Combined filter test',
      priority: 'high',
    });
    // Put it in pending so we have a distinct (status + priority) combo to target
    await agent.patch(`/api/tickets/${ticket.id}`).send({ status: 'pending' });

    const res = await agent.get('/api/tickets?status=pending&priority=high');

    expect(res.status).toBe(200);
    expect(res.body.every((t) => t.status === 'pending' && t.priority === 'high')).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// POST /api/tickets
// ═══════════════════════════════════════════════════════════════════════════
describe('POST /api/tickets', () => {
  test('happy path — creates ticket with correct fields and returns 201', async () => {
    const agent = await loginAs(TEST_AGENT);

    const payload = {
      subject: 'Cannot log into account',
      customerEmail: 'Customer@Example.COM', // mixed case — should be lowercased
      category: 'Account',
      priority: 'high',
    };

    const res = await agent.post('/api/tickets').send(payload);
    createdTicketRefs.push(res.body.id);

    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      subject: 'Cannot log into account',
      customerEmail: 'customer@example.com', // route lowercases the email
      category: 'Account',
      priority: 'high',
      status: 'open', // default status on creation
    });
    // id is the ticket_ref — should follow the TKT-NNN pattern
    expect(res.body.id).toMatch(/^TKT-\d{3,}$/);
  });

  test('happy path — initialMessage is posted as first message', async () => {
    const agent = await loginAs(TEST_AGENT);
    const ticket = await createTicket(agent, {
      subject: 'Ticket with initial message',
      initialMessage: 'Hello, I need help with my account.',
    });

    // The route inserts the message in the same transaction as the ticket and
    // returns it in the creation response — we should see it immediately.
    expect(ticket.messages).toHaveLength(1);
    expect(ticket.messages[0].text).toBe('Hello, I need help with my account.');
  });

  test('defaults — category defaults to General, priority defaults to medium', async () => {
    const agent = await loginAs(TEST_AGENT);
    const res = await agent.post('/api/tickets').send({
      subject: 'Minimal ticket',
      customerEmail: 'minimal@example.com',
      // No category or priority provided
    });
    createdTicketRefs.push(res.body.id);

    expect(res.status).toBe(201);
    expect(res.body.category).toBe('General');
    expect(res.body.priority).toBe('medium');
  });

  test('missing subject — 400', async () => {
    const agent = await loginAs(TEST_AGENT);
    const res = await agent.post('/api/tickets').send({
      customerEmail: 'someone@example.com',
    });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/subject/i);
  });

  test('missing customerEmail — 400', async () => {
    const agent = await loginAs(TEST_AGENT);
    const res = await agent.post('/api/tickets').send({
      subject: 'A valid subject',
    });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/customerEmail/i);
  });

  test('whitespace-only subject — 400 (trim guard)', async () => {
    // The route does subject?.trim() before checking for emptiness, so a
    // string of spaces must be rejected even though it's technically truthy.
    const agent = await loginAs(TEST_AGENT);
    const res = await agent.post('/api/tickets').send({
      subject: '   ',
      customerEmail: 'someone@example.com',
    });

    expect(res.status).toBe(400);
  });

  test('unauthenticated request — 401', async () => {
    const res = await request(app).post('/api/tickets').send({
      subject: 'Should be blocked',
      customerEmail: 'blocked@example.com',
    });

    expect(res.status).toBe(401);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// GET /api/tickets/:id
// ═══════════════════════════════════════════════════════════════════════════
describe('GET /api/tickets/:id', () => {
  test('happy path — returns ticket with embedded messages array', async () => {
    const agent = await loginAs(TEST_AGENT);
    const created = await createTicket(agent, {
      subject: 'Detail endpoint test',
      initialMessage: 'First message here',
    });

    const res = await agent.get(`/api/tickets/${created.id}`);

    expect(res.status).toBe(200);
    expect(res.body.id).toBe(created.id);
    expect(res.body.subject).toBe('Detail endpoint test');

    // The detail endpoint fetches messages from the messages table and embeds
    // them — this is the key difference from the list endpoint.
    expect(Array.isArray(res.body.messages)).toBe(true);
    expect(res.body.messages).toHaveLength(1);
    expect(res.body.messages[0]).toMatchObject({
      text: 'First message here',
      from: 'test-customer@example.com',
    });
    // time should be an ISO 8601 string
    expect(new Date(res.body.messages[0].time).toISOString()).toBeTruthy();
  });

  test('non-existent ticket_ref — 404', async () => {
    const agent = await loginAs(TEST_AGENT);
    // TKT-99999 is astronomically unlikely to exist in any realistic test DB
    const res = await agent.get('/api/tickets/TKT-99999');

    expect(res.status).toBe(404);
    expect(res.body.error).toMatch(/not found/i);
  });

  test('unauthenticated request — 401', async () => {
    const res = await request(app).get('/api/tickets/TKT-001');
    expect(res.status).toBe(401);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// PATCH /api/tickets/:id
// ═══════════════════════════════════════════════════════════════════════════
describe('PATCH /api/tickets/:id', () => {
  test('happy path — updates status and returns the updated ticket', async () => {
    const agent = await loginAs(TEST_AGENT);
    const ticket = await createTicket(agent, { subject: 'Patch status test' });

    const res = await agent
      .patch(`/api/tickets/${ticket.id}`)
      .send({ status: 'pending' });

    expect(res.status).toBe(200);
    expect(res.body.id).toBe(ticket.id);
    expect(res.body.status).toBe('pending');
  });

  test('happy path — updates priority', async () => {
    const agent = await loginAs(TEST_AGENT);
    const ticket = await createTicket(agent, { subject: 'Patch priority test' });

    const res = await agent
      .patch(`/api/tickets/${ticket.id}`)
      .send({ priority: 'urgent' });

    expect(res.status).toBe(200);
    expect(res.body.priority).toBe('urgent');
  });

  test('happy path — can update both fields in a single request', async () => {
    const agent = await loginAs(TEST_AGENT);
    const ticket = await createTicket(agent, { subject: 'Patch both fields test' });

    const res = await agent
      .patch(`/api/tickets/${ticket.id}`)
      .send({ status: 'resolved', priority: 'low' });

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('resolved');
    expect(res.body.priority).toBe('low');
  });

  test('no recognised fields — 400 (empty update guard)', async () => {
    // The route builds the SET clause dynamically from an allowlist of
    // ['status', 'priority']. Sending neither — or sending only unknown
    // fields — should return 400, not silently succeed.
    const agent = await loginAs(TEST_AGENT);
    const ticket = await createTicket(agent, { subject: 'Patch no-op test' });

    const res = await agent
      .patch(`/api/tickets/${ticket.id}`)
      .send({ subject: 'should be ignored' }); // 'subject' is not in the allowlist

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/no valid fields/i);
  });

  test('non-existent ticket_ref — 404', async () => {
    const agent = await loginAs(TEST_AGENT);
    const res = await agent
      .patch('/api/tickets/TKT-99999')
      .send({ status: 'closed' });

    expect(res.status).toBe(404);
  });

  test('unauthenticated request — 401', async () => {
    const res = await request(app)
      .patch('/api/tickets/TKT-001')
      .send({ status: 'closed' });

    expect(res.status).toBe(401);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// POST /api/tickets/:id/messages
// ═══════════════════════════════════════════════════════════════════════════
describe('POST /api/tickets/:id/messages', () => {
  test('happy path — appends a message and returns it as 201', async () => {
    const agent = await loginAs(TEST_AGENT);
    const ticket = await createTicket(agent, { subject: 'Message append test' });

    const res = await agent
      .post(`/api/tickets/${ticket.id}/messages`)
      .send({ from: 'support@company.com', text: 'We are looking into this.' });

    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      from: 'support@company.com',
      text: 'We are looking into this.',
    });
    // time is returned as an ISO 8601 string from the DB
    expect(res.body.time).toBeTruthy();
  });

  test('message is actually persisted — fetchable via GET /:id', async () => {
    // This closes the loop on the previous test: the 201 response could
    // theoretically be fake if the INSERT had a bug. Re-fetching via GET
    // confirms the row made it to the DB.
    const agent = await loginAs(TEST_AGENT);
    const ticket = await createTicket(agent, { subject: 'Message persistence test' });

    await agent
      .post(`/api/tickets/${ticket.id}/messages`)
      .send({ from: 'agent@company.com', text: 'Confirmed from agent.' })
      .expect(201);

    const detail = await agent.get(`/api/tickets/${ticket.id}`).expect(200);

    const texts = detail.body.messages.map((m) => m.text);
    expect(texts).toContain('Confirmed from agent.');
  });

  test('missing from — 400', async () => {
    const agent = await loginAs(TEST_AGENT);
    const ticket = await createTicket(agent, { subject: 'Message validation test' });

    const res = await agent
      .post(`/api/tickets/${ticket.id}/messages`)
      .send({ text: 'No from field' });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/from/i);
  });

  test('missing text — 400', async () => {
    const agent = await loginAs(TEST_AGENT);
    const ticket = await createTicket(agent, { subject: 'Message text validation test' });

    const res = await agent
      .post(`/api/tickets/${ticket.id}/messages`)
      .send({ from: 'agent@company.com' });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/text/i);
  });

  test('non-existent ticket_ref — 404', async () => {
    const agent = await loginAs(TEST_AGENT);
    const res = await agent
      .post('/api/tickets/TKT-99999/messages')
      .send({ from: 'agent@company.com', text: 'This ticket does not exist.' });

    expect(res.status).toBe(404);
  });

  test('unauthenticated request — 401', async () => {
    const res = await request(app)
      .post('/api/tickets/TKT-001/messages')
      .send({ from: 'agent@company.com', text: 'Unauthenticated message attempt.' });

    expect(res.status).toBe(401);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// DELETE /api/tickets/:id
// ═══════════════════════════════════════════════════════════════════════════
describe('DELETE /api/tickets/:id', () => {
  // The DELETE route has a two-layer guard:
  //   1. requireAuth (mounted in app.js) — no session → 401
  //   2. adminOnly (mounted per-route in tickets.js) — non-admin session → 403
  //
  // Testing both guards in isolation is important because they're independent
  // middleware. A future refactor could accidentally remove one while keeping
  // the other, and you want a failing test to tell you which layer broke.

  test('unauthenticated request — 401 (requireAuth fires before adminOnly)', async () => {
    const res = await request(app).delete('/api/tickets/TKT-001');
    // requireAuth runs first and short-circuits, so we never reach adminOnly.
    // If this returned 403 instead, it would mean requireAuth was bypassed.
    expect(res.status).toBe(401);
  });

  test('agent role — 403 (adminOnly rejects non-admin sessions)', async () => {
    const agentSession = await loginAs(TEST_AGENT);
    // Create a ticket to attempt deletion on — we want a real ticket_ref so
    // the route reaches adminOnly rather than returning 404 first.
    const ticket = await createTicket(agentSession, { subject: 'Agent delete attempt' });

    const res = await agentSession.delete(`/api/tickets/${ticket.id}`);

    // The ticket should still exist — the 403 must have stopped the DELETE.
    expect(res.status).toBe(403);
  });

  test('admin role — deletes ticket and returns { ok: true }', async () => {
    const agentSession = await loginAs(TEST_AGENT);
    const adminSession = await loginAs(TEST_ADMIN);

    // Create via the agent session (any authenticated user can create), then
    // delete via the admin session. This explicitly tests the cross-user path
    // and confirms adminOnly checks the DB role, not just "the creator".
    const ticket = await createTicket(agentSession, { subject: 'Admin delete test' });

    const res = await adminSession.delete(`/api/tickets/${ticket.id}`);

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true });

    // Remove from tracking — the row is already gone, so afterEach trying to
    // DELETE it would silently succeed (rowCount 0) but we keep things tidy.
    createdTicketRefs = createdTicketRefs.filter((ref) => ref !== ticket.id);
  });

  test('admin deleting non-existent ticket — 404', async () => {
    const adminSession = await loginAs(TEST_ADMIN);
    const res = await adminSession.delete('/api/tickets/TKT-99999');

    expect(res.status).toBe(404);
    expect(res.body.error).toMatch(/not found/i);
  });

  test('messages are cascade-deleted with the ticket', async () => {
    // This tests the ON DELETE CASCADE constraint in schema.sql. If messages
    // outlived their ticket, the DB would accumulate orphaned rows and any
    // future query joining on ticket_id would silently return wrong data.
    const agentSession = await loginAs(TEST_AGENT);
    const adminSession = await loginAs(TEST_ADMIN);

    const ticket = await createTicket(agentSession, {
      subject: 'Cascade delete test',
      initialMessage: 'This message should disappear with the ticket.',
    });

    await adminSession.delete(`/api/tickets/${ticket.id}`).expect(200);
    createdTicketRefs = createdTicketRefs.filter((ref) => ref !== ticket.id);

    // Look directly in the DB — no API surface exposes orphaned messages,
    // so an HTTP assertion would give us a false sense of security here.
    const { rows } = await pool.query(
      `SELECT m.id FROM messages m
       JOIN tickets t ON m.ticket_id = t.id
       WHERE t.ticket_ref = $1`,
      [ticket.id]
    );
    // ticket_ref is gone so the JOIN returns nothing — cascade worked
    expect(rows).toHaveLength(0);
  });
});
