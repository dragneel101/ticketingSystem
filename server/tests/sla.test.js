'use strict';

const request = require('supertest');
const bcrypt = require('bcryptjs');
const app = require('../app');
const pool = require('../db');

const TEST_ADMIN = {
  email: 'sla-test-admin@example.com',
  name: 'SLA Test Admin',
  password: 'adminpass123',
  role: 'admin',
};

const TEST_AGENT = {
  email: 'sla-test-agent@example.com',
  name: 'SLA Test Agent',
  password: 'agentpass123',
  role: 'agent',
};

let adminId;
let agentId;
let createdPolicyIds = [];

// ── Default policy id — needed for set-default restore ────────
let originalDefaultId;

beforeAll(async () => {
  const [adminHash, agentHash] = await Promise.all([
    bcrypt.hash(TEST_ADMIN.password, 10),
    bcrypt.hash(TEST_AGENT.password, 10),
  ]);
  const { rows: a } = await pool.query(
    `INSERT INTO users (email, name, password_hash, role) VALUES ($1,$2,$3,$4)
     ON CONFLICT (email) DO UPDATE SET password_hash = EXCLUDED.password_hash RETURNING id`,
    [TEST_ADMIN.email, TEST_ADMIN.name, adminHash, TEST_ADMIN.role]
  );
  const { rows: b } = await pool.query(
    `INSERT INTO users (email, name, password_hash, role) VALUES ($1,$2,$3,$4)
     ON CONFLICT (email) DO UPDATE SET password_hash = EXCLUDED.password_hash RETURNING id`,
    [TEST_AGENT.email, TEST_AGENT.name, agentHash, TEST_AGENT.role]
  );
  adminId = a[0].id;
  agentId = b[0].id;

  // Snapshot the current default policy so we can restore it after any tests
  // that call set-default — keeps the DB clean for other test suites.
  const { rows: defaults } = await pool.query('SELECT id FROM sla_policies WHERE is_default = TRUE');
  originalDefaultId = defaults[0]?.id ?? null;
});

afterEach(async () => {
  if (createdPolicyIds.length > 0) {
    // Unlink any companies pointing at test policies before deleting
    await pool.query('UPDATE companies SET sla_policy_id = NULL WHERE sla_policy_id = ANY($1)', [createdPolicyIds]);
    await pool.query('DELETE FROM sla_policies WHERE id = ANY($1)', [createdPolicyIds]);
    createdPolicyIds = [];
  }
});

afterAll(async () => {
  // Restore original default if any test changed it
  if (originalDefaultId) {
    await pool.query('UPDATE sla_policies SET is_default = FALSE');
    await pool.query('UPDATE sla_policies SET is_default = TRUE WHERE id = $1', [originalDefaultId]);
  }
  await pool.query('DELETE FROM users WHERE id = ANY($1)', [[adminId, agentId]]);
  await pool.end();
});

async function loginAs(creds) {
  const agent = request.agent(app);
  await agent.post('/api/auth/login').send({ email: creds.email, password: creds.password }).expect(200);
  return agent;
}

const POLICY_BODY = {
  name: `Test SLA Policy ${Date.now()}`,
  response_low_minutes: 480,
  response_medium_minutes: 240,
  response_high_minutes: 60,
  response_urgent_minutes: 15,
  resolution_low_minutes: 2880,
  resolution_medium_minutes: 1440,
  resolution_high_minutes: 480,
  resolution_urgent_minutes: 240,
  is_default: false,
};

async function createPolicy(adminAgent, overrides = {}) {
  const body = { ...POLICY_BODY, name: `Test Policy ${Date.now()}`, ...overrides };
  const res = await adminAgent.post('/api/sla-policies').send(body).expect(201);
  createdPolicyIds.push(res.body.id);
  return res.body;
}

// ═══════════════════════════════════════════════════════════════
// GET /api/sla-policies
// ═══════════════════════════════════════════════════════════════
describe('GET /api/sla-policies', () => {
  test('authenticated user gets array of policies', async () => {
    const agent = await loginAs(TEST_AGENT);
    const res = await agent.get('/api/sla-policies');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  test('each policy has expected shape', async () => {
    const admin = await loginAs(TEST_ADMIN);
    await createPolicy(admin);
    const agent = await loginAs(TEST_AGENT);
    const res = await agent.get('/api/sla-policies');
    const policy = res.body.find((p) => createdPolicyIds.includes(p.id));
    expect(policy).toBeDefined();
    expect(policy).toHaveProperty('id');
    expect(policy).toHaveProperty('name');
    expect(policy).toHaveProperty('is_default');
    expect(policy).toHaveProperty('response_high_minutes');
    expect(policy).toHaveProperty('resolution_urgent_minutes');
  });

  test('unauthenticated — 401', async () => {
    const res = await request(app).get('/api/sla-policies');
    expect(res.status).toBe(401);
  });
});

// ═══════════════════════════════════════════════════════════════
// POST /api/sla-policies
// ═══════════════════════════════════════════════════════════════
describe('POST /api/sla-policies', () => {
  test('admin creates a policy — 201 with full policy object', async () => {
    const admin = await loginAs(TEST_ADMIN);
    const res = await admin.post('/api/sla-policies').send(POLICY_BODY);
    createdPolicyIds.push(res.body.id);
    expect(res.status).toBe(201);
    expect(res.body.name).toBe(POLICY_BODY.name);
    expect(res.body.response_high_minutes).toBe(60);
    expect(res.body.is_default).toBe(false);
  });

  test('new default policy demotes previous default', async () => {
    const admin = await loginAs(TEST_ADMIN);

    // Create a non-default policy first, then promote it
    const policy = await createPolicy(admin, { is_default: false });

    // Create another policy as default — should demote all others
    const defaultPolicy = await createPolicy(admin, { is_default: true });

    // Verify previous default is no longer default
    const listRes = await admin.get('/api/sla-policies');
    const previous = listRes.body.find((p) => p.id === policy.id);
    expect(previous.is_default).toBe(false);
    expect(defaultPolicy.is_default).toBe(true);
  });

  test('missing name — 400', async () => {
    const admin = await loginAs(TEST_ADMIN);
    const { name, ...bodyWithoutName } = POLICY_BODY;
    const res = await admin.post('/api/sla-policies').send(bodyWithoutName);
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/name is required/i);
  });

  test('duplicate name — 409', async () => {
    const admin = await loginAs(TEST_ADMIN);
    const policy = await createPolicy(admin);
    const res = await admin.post('/api/sla-policies').send({ ...POLICY_BODY, name: policy.name });
    expect(res.status).toBe(409);
  });

  test('agent — 403', async () => {
    const agent = await loginAs(TEST_AGENT);
    const res = await agent.post('/api/sla-policies').send(POLICY_BODY);
    expect(res.status).toBe(403);
  });

  test('unauthenticated — 401', async () => {
    const res = await request(app).post('/api/sla-policies').send(POLICY_BODY);
    expect(res.status).toBe(401);
  });
});

// ═══════════════════════════════════════════════════════════════
// PATCH /api/sla-policies/:id
// ═══════════════════════════════════════════════════════════════
describe('PATCH /api/sla-policies/:id', () => {
  test('admin updates a policy name', async () => {
    const admin = await loginAs(TEST_ADMIN);
    const policy = await createPolicy(admin);
    const newName = `Updated ${Date.now()}`;
    const res = await admin.patch(`/api/sla-policies/${policy.id}`).send({ name: newName });
    expect(res.status).toBe(200);
    expect(res.body.name).toBe(newName);
  });

  test('admin updates time fields', async () => {
    const admin = await loginAs(TEST_ADMIN);
    const policy = await createPolicy(admin);
    const res = await admin.patch(`/api/sla-policies/${policy.id}`).send({ response_urgent_minutes: 10 });
    expect(res.status).toBe(200);
    expect(res.body.response_urgent_minutes).toBe(10);
  });

  test('promoting to default demotes previous default', async () => {
    const admin = await loginAs(TEST_ADMIN);
    const policy = await createPolicy(admin);

    await admin.patch(`/api/sla-policies/${policy.id}`).send({ is_default: true });

    const listRes = await admin.get('/api/sla-policies');
    const defaultPolicies = listRes.body.filter((p) => p.is_default);
    expect(defaultPolicies).toHaveLength(1);
    expect(defaultPolicies[0].id).toBe(policy.id);
  });

  test('non-existent policy — 404', async () => {
    const admin = await loginAs(TEST_ADMIN);
    const res = await admin.patch('/api/sla-policies/999999').send({ name: 'Ghost' });
    expect(res.status).toBe(404);
  });

  test('agent — 403', async () => {
    const admin = await loginAs(TEST_ADMIN);
    const policy = await createPolicy(admin);
    const agent = await loginAs(TEST_AGENT);
    const res = await agent.patch(`/api/sla-policies/${policy.id}`).send({ name: 'Hijack' });
    expect(res.status).toBe(403);
  });
});

// ═══════════════════════════════════════════════════════════════
// DELETE /api/sla-policies/:id
// ═══════════════════════════════════════════════════════════════
describe('DELETE /api/sla-policies/:id', () => {
  test('admin deletes a non-default policy — 200 { ok: true }', async () => {
    const admin = await loginAs(TEST_ADMIN);
    const policy = await createPolicy(admin, { is_default: false });
    const res = await admin.delete(`/api/sla-policies/${policy.id}`);
    createdPolicyIds = createdPolicyIds.filter((id) => id !== policy.id);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true });
  });

  test('cannot delete the default policy — 409', async () => {
    const admin = await loginAs(TEST_ADMIN);
    // Find the current default
    const listRes = await admin.get('/api/sla-policies');
    const defaultPolicy = listRes.body.find((p) => p.is_default);
    if (!defaultPolicy) return; // skip if no default exists in this DB

    const res = await admin.delete(`/api/sla-policies/${defaultPolicy.id}`);
    expect(res.status).toBe(409);
    expect(res.body.error).toMatch(/cannot delete the default/i);
  });

  test('non-existent policy — 404', async () => {
    const admin = await loginAs(TEST_ADMIN);
    const res = await admin.delete('/api/sla-policies/999999');
    expect(res.status).toBe(404);
  });

  test('agent — 403', async () => {
    const admin = await loginAs(TEST_ADMIN);
    const policy = await createPolicy(admin);
    const agent = await loginAs(TEST_AGENT);
    const res = await agent.delete(`/api/sla-policies/${policy.id}`);
    expect(res.status).toBe(403);
  });
});

// ═══════════════════════════════════════════════════════════════
// PATCH /api/sla-policies/:id/set-default
// ═══════════════════════════════════════════════════════════════
describe('PATCH /api/sla-policies/:id/set-default', () => {
  test('promotes a policy to default and demotes all others', async () => {
    const admin = await loginAs(TEST_ADMIN);
    const policy = await createPolicy(admin, { is_default: false });

    const res = await admin.patch(`/api/sla-policies/${policy.id}/set-default`);
    expect(res.status).toBe(200);
    expect(res.body.is_default).toBe(true);
    expect(res.body.id).toBe(policy.id);

    // Confirm only one default exists in total
    const listRes = await admin.get('/api/sla-policies');
    const defaults = listRes.body.filter((p) => p.is_default);
    expect(defaults).toHaveLength(1);
  });

  test('non-existent policy — 404', async () => {
    const admin = await loginAs(TEST_ADMIN);
    const res = await admin.patch('/api/sla-policies/999999/set-default');
    expect(res.status).toBe(404);
  });

  test('agent — 403', async () => {
    const admin = await loginAs(TEST_ADMIN);
    const policy = await createPolicy(admin);
    const agent = await loginAs(TEST_AGENT);
    const res = await agent.patch(`/api/sla-policies/${policy.id}/set-default`);
    expect(res.status).toBe(403);
  });

  test('unauthenticated — 401', async () => {
    const res = await request(app).patch('/api/sla-policies/1/set-default');
    expect(res.status).toBe(401);
  });
});
