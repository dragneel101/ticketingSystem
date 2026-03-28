'use strict';

const request = require('supertest');
const bcrypt = require('bcryptjs');
const app = require('../app');
const pool = require('../db');

// ── Test fixtures ─────────────────────────────────────────────
// We create real rows in the DB so middleware like adminOnly (which re-queries
// the DB per request) works exactly as it does in production.
const TEST_ADMIN = {
  email: 'test-admin@example.com',
  name: 'Test Admin',
  password: 'adminpass123',
  role: 'admin',
};

const TEST_AGENT = {
  email: 'test-agent@example.com',
  name: 'Test Agent',
  password: 'agentpass123',
  role: 'agent',
};

let adminId;
let agentId;

beforeAll(async () => {
  // Hash both passwords in parallel — no reason to do them sequentially
  const [adminHash, agentHash] = await Promise.all([
    bcrypt.hash(TEST_ADMIN.password, 10),
    bcrypt.hash(TEST_AGENT.password, 10),
  ]);

  // Insert test users, returning their IDs so afterAll can clean them up.
  // ON CONFLICT DO NOTHING handles the case where a previous test run left
  // rows behind (e.g. the test process was killed before afterAll ran).
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

afterAll(async () => {
  // Remove test users and close the pool so Jest can exit cleanly.
  await pool.query('DELETE FROM users WHERE id = ANY($1)', [[adminId, agentId]]);
  await pool.end();
});

// ── Helper: log in and return a supertest agent with the session cookie ────
// supertest's `agent` persists cookies across requests, which is exactly how
// a browser session works. We reuse this in every test that needs auth.
async function loginAs(credentials) {
  const agent = request.agent(app);
  await agent
    .post('/api/auth/login')
    .send({ email: credentials.email, password: credentials.password })
    .expect(200);
  return agent;
}

// ═══════════════════════════════════════════════════════════════════════════
// POST /api/auth/login
// ═══════════════════════════════════════════════════════════════════════════
describe('POST /api/auth/login', () => {
  test('happy path — returns user object on valid credentials', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: TEST_ADMIN.email, password: TEST_ADMIN.password });

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      email: TEST_ADMIN.email,
      name: TEST_ADMIN.name,
      role: TEST_ADMIN.role,
    });
    // Password hash must never be exposed in the response
    expect(res.body.password_hash).toBeUndefined();
  });

  test('wrong password — 401', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: TEST_ADMIN.email, password: 'wrongpassword' });

    expect(res.status).toBe(401);
    expect(res.body.error).toMatch(/invalid/i);
  });

  test('unknown email — 401 (same message, no oracle for email existence)', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'nobody@example.com', password: 'anypassword' });

    expect(res.status).toBe(401);
  });

  test('missing email — 400', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ password: 'somepassword' });

    expect(res.status).toBe(400);
  });

  test('missing password — 400', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: TEST_ADMIN.email });

    expect(res.status).toBe(400);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// GET /api/auth/me
// ═══════════════════════════════════════════════════════════════════════════
describe('GET /api/auth/me', () => {
  test('returns user when session is active', async () => {
    // Log in first so the agent carries the session cookie
    const agent = await loginAs(TEST_ADMIN);
    const res = await agent.get('/api/auth/me');

    expect(res.status).toBe(200);
    expect(res.body.user).toMatchObject({
      email: TEST_ADMIN.email,
      role: TEST_ADMIN.role,
    });
  });

  test('returns { user: null } with no session cookie', async () => {
    // A fresh request() has no cookie jar — simulates an unauthenticated browser
    const res = await request(app).get('/api/auth/me');

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ user: null });
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// POST /api/auth/users
// ═══════════════════════════════════════════════════════════════════════════
describe('POST /api/auth/users', () => {
  // Track users created during these tests so we can clean them up
  const createdEmails = [];

  afterEach(async () => {
    if (createdEmails.length) {
      await pool.query('DELETE FROM users WHERE email = ANY($1)', [createdEmails]);
      createdEmails.length = 0;
    }
  });

  test('creates a new user as admin — 201', async () => {
    const agent = await loginAs(TEST_ADMIN);
    const newUser = {
      email: 'new-agent@example.com',
      name: 'New Agent',
      password: 'securepassword99',
      role: 'agent',
    };
    createdEmails.push(newUser.email);

    const res = await agent.post('/api/auth/users').send(newUser);

    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ email: newUser.email, name: newUser.name, role: 'agent' });
  });

  test('duplicate email — 409', async () => {
    const agent = await loginAs(TEST_ADMIN);
    // TEST_AGENT already exists in the DB
    const res = await agent.post('/api/auth/users').send({
      email: TEST_AGENT.email,
      name: 'Duplicate',
      password: 'somepassword99',
      role: 'agent',
    });

    expect(res.status).toBe(409);
    expect(res.body.error).toMatch(/email already in use/i);
  });

  test('password too short — 400 with policy message', async () => {
    const agent = await loginAs(TEST_ADMIN);

    // Fetch the current policy so the test stays correct if the setting changes
    const settingsRes = await agent.get('/api/settings');
    const minLength = settingsRes.body.min_password_length;
    const shortPassword = 'x'.repeat(minLength - 1);

    const res = await agent.post('/api/auth/users').send({
      email: 'short-pw@example.com',
      name: 'Short PW',
      password: shortPassword,
      role: 'agent',
    });

    expect(res.status).toBe(400);
    // The message tells the user the required minimum — don't hardcode 10
    expect(res.body.error).toMatch(/at least \d+ characters/i);
  });

  test('non-admin user — 403', async () => {
    const agent = await loginAs(TEST_AGENT);
    const res = await agent.post('/api/auth/users').send({
      email: 'blocked@example.com',
      name: 'Blocked',
      password: 'somepassword99',
      role: 'agent',
    });

    expect(res.status).toBe(403);
  });

  test('unauthenticated — 401', async () => {
    const res = await request(app).post('/api/auth/users').send({
      email: 'unauth@example.com',
      name: 'Unauth',
      password: 'somepassword99',
      role: 'agent',
    });

    expect(res.status).toBe(401);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// GET /api/settings
// ═══════════════════════════════════════════════════════════════════════════
describe('GET /api/settings', () => {
  test('returns settings object for admin', async () => {
    const agent = await loginAs(TEST_ADMIN);
    const res = await agent.get('/api/settings');

    expect(res.status).toBe(200);
    // min_password_length is coerced to a number by the route handler
    expect(typeof res.body.min_password_length).toBe('number');
  });

  test('returns 403 for non-admin', async () => {
    const agent = await loginAs(TEST_AGENT);
    const res = await agent.get('/api/settings');

    expect(res.status).toBe(403);
  });

  test('returns 401 when unauthenticated', async () => {
    const res = await request(app).get('/api/settings');
    // requireAuth fires before adminOnly, so we get 401 not 403
    expect(res.status).toBe(401);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// PATCH /api/settings
// ═══════════════════════════════════════════════════════════════════════════
describe('PATCH /api/settings', () => {
  let originalMinLength;

  beforeAll(async () => {
    // Snapshot the current value so we can restore it after the tests.
    // This keeps the test suite idempotent — running it twice in a row
    // leaves the DB in the same state.
    const agent = await loginAs(TEST_ADMIN);
    const res = await agent.get('/api/settings');
    originalMinLength = res.body.min_password_length;
  });

  afterAll(async () => {
    // Restore whatever the policy was before we started
    const agent = await loginAs(TEST_ADMIN);
    await agent.patch('/api/settings').send({ min_password_length: originalMinLength });
  });

  test('admin can update min_password_length', async () => {
    const agent = await loginAs(TEST_ADMIN);
    const res = await agent
      .patch('/api/settings')
      .send({ min_password_length: 12 });

    expect(res.status).toBe(200);
    expect(res.body.min_password_length).toBe(12);
  });

  test('rejects value below floor (10) — 400', async () => {
    const agent = await loginAs(TEST_ADMIN);
    const res = await agent
      .patch('/api/settings')
      .send({ min_password_length: 5 });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/cannot be less than/i);
  });

  test('rejects non-integer string — 400', async () => {
    const agent = await loginAs(TEST_ADMIN);
    const res = await agent
      .patch('/api/settings')
      .send({ min_password_length: 'abc' });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/must be an integer/i);
  });

  test('rejects float — 400', async () => {
    const agent = await loginAs(TEST_ADMIN);
    const res = await agent
      .patch('/api/settings')
      .send({ min_password_length: 10.5 });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/must be an integer/i);
  });

  test('non-admin — 403', async () => {
    const agent = await loginAs(TEST_AGENT);
    const res = await agent
      .patch('/api/settings')
      .send({ min_password_length: 12 });

    expect(res.status).toBe(403);
  });

  test('unauthenticated — 401', async () => {
    const res = await request(app)
      .patch('/api/settings')
      .send({ min_password_length: 12 });

    expect(res.status).toBe(401);
  });
});
