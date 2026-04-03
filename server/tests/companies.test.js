'use strict';

const request = require('supertest');
const bcrypt = require('bcryptjs');
const app = require('../app');
const pool = require('../db');

const TEST_ADMIN = {
  email: 'companies-test-admin@example.com',
  name: 'Companies Test Admin',
  password: 'adminpass123',
  role: 'admin',
};

const TEST_AGENT = {
  email: 'companies-test-agent@example.com',
  name: 'Companies Test Agent',
  password: 'agentpass123',
  role: 'agent',
};

let adminId;
let agentId;
let createdCompanyIds = [];
let createdCustomerIds = [];
let createdTicketRefs = [];

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

  await pool.query(`
    SELECT setval(
      'ticket_ref_seq',
      COALESCE((SELECT MAX(CAST(REGEXP_REPLACE(ticket_ref,'[^0-9]','','g') AS INT)) FROM tickets),0)
    )
  `);
});

afterEach(async () => {
  if (createdTicketRefs.length) {
    await pool.query('DELETE FROM tickets WHERE ticket_ref = ANY($1)', [createdTicketRefs]);
    createdTicketRefs = [];
  }
  if (createdCustomerIds.length) {
    await pool.query('DELETE FROM customers WHERE id = ANY($1)', [createdCustomerIds]);
    createdCustomerIds = [];
  }
  if (createdCompanyIds.length) {
    await pool.query('DELETE FROM companies WHERE id = ANY($1)', [createdCompanyIds]);
    createdCompanyIds = [];
  }
});

afterAll(async () => {
  await pool.query('DELETE FROM users WHERE id = ANY($1)', [[adminId, agentId]]);
  await pool.end();
});

async function loginAs(creds) {
  const agent = request.agent(app);
  await agent.post('/api/auth/login').send({ email: creds.email, password: creds.password }).expect(200);
  return agent;
}

async function createCompany(agentSession, overrides = {}) {
  const body = { name: `Test Co ${Date.now()}`, ...overrides };
  const res = await agentSession.post('/api/companies').send(body).expect(201);
  createdCompanyIds.push(res.body.id);
  return res.body;
}

// ═══════════════════════════════════════════════════════════════
// GET /api/companies
// ═══════════════════════════════════════════════════════════════
describe('GET /api/companies', () => {
  test('returns companies array for authenticated user', async () => {
    const agent = await loginAs(TEST_AGENT);
    const res = await agent.get('/api/companies');
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('companies');
    expect(Array.isArray(res.body.companies)).toBe(true);
  });

  test('each company has stats columns', async () => {
    const agent = await loginAs(TEST_AGENT);
    await createCompany(agent);
    const res = await agent.get('/api/companies');
    const co = res.body.companies.find((c) => createdCompanyIds.includes(c.id));
    expect(co).toHaveProperty('customer_count');
    expect(co).toHaveProperty('ticket_count');
    expect(co).toHaveProperty('open_ticket_count');
  });

  test('?search= filters by name', async () => {
    const agent = await loginAs(TEST_AGENT);
    const unique = `UniqueSearchName${Date.now()}`;
    await createCompany(agent, { name: unique });
    const res = await agent.get(`/api/companies?search=${unique}`);
    expect(res.status).toBe(200);
    expect(res.body.companies.every((c) => c.name.includes(unique))).toBe(true);
  });

  test('unauthenticated — 401', async () => {
    const res = await request(app).get('/api/companies');
    expect(res.status).toBe(401);
  });
});

// ═══════════════════════════════════════════════════════════════
// GET /api/companies/suggest
// ═══════════════════════════════════════════════════════════════
describe('GET /api/companies/suggest', () => {
  test('returns up to 8 matches for partial name', async () => {
    const agent = await loginAs(TEST_AGENT);
    const prefix = `Suggest${Date.now()}`;
    await createCompany(agent, { name: `${prefix} Alpha` });
    await createCompany(agent, { name: `${prefix} Beta` });
    const res = await agent.get(`/api/companies/suggest?q=${prefix}`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.length).toBeGreaterThanOrEqual(2);
    expect(res.body.length).toBeLessThanOrEqual(8);
  });

  test('returns empty array for non-matching query', async () => {
    const agent = await loginAs(TEST_AGENT);
    const res = await agent.get('/api/companies/suggest?q=ZZZNoMatchXXX');
    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });

  test('unauthenticated — 401', async () => {
    const res = await request(app).get('/api/companies/suggest?q=test');
    expect(res.status).toBe(401);
  });
});

// ═══════════════════════════════════════════════════════════════
// POST /api/companies
// ═══════════════════════════════════════════════════════════════
describe('POST /api/companies', () => {
  test('creates a company — 201 with company object', async () => {
    const agent = await loginAs(TEST_AGENT);
    const res = await agent.post('/api/companies').send({ name: `Create Test ${Date.now()}` });
    createdCompanyIds.push(res.body.id);
    expect(res.status).toBe(201);
    expect(res.body).toHaveProperty('id');
    expect(res.body).toHaveProperty('name');
  });

  test('creates with optional fields', async () => {
    const agent = await loginAs(TEST_AGENT);
    const body = {
      name: `Full Co ${Date.now()}`,
      address: '123 Main St',
      primary_contact: 'Jane Doe',
      phone: '555-1234',
    };
    const res = await agent.post('/api/companies').send(body);
    createdCompanyIds.push(res.body.id);
    expect(res.status).toBe(201);
    expect(res.body.address).toBe(body.address);
    expect(res.body.primary_contact).toBe(body.primary_contact);
  });

  test('missing name — 400', async () => {
    const agent = await loginAs(TEST_AGENT);
    const res = await agent.post('/api/companies').send({ address: '123 Main St' });
    expect(res.status).toBe(400);
  });

  test('unauthenticated — 401', async () => {
    const res = await request(app).post('/api/companies').send({ name: 'Anon Co' });
    expect(res.status).toBe(401);
  });
});

// ═══════════════════════════════════════════════════════════════
// PATCH /api/companies/:id
// ═══════════════════════════════════════════════════════════════
describe('PATCH /api/companies/:id', () => {
  test('updates name', async () => {
    const agent = await loginAs(TEST_AGENT);
    const co = await createCompany(agent);
    const newName = `Renamed Co ${Date.now()}`;
    const res = await agent.patch(`/api/companies/${co.id}`).send({ name: newName });
    expect(res.status).toBe(200);
    expect(res.body.name).toBe(newName);
  });

  test('clears sla_policy_id by sending null', async () => {
    const agent = await loginAs(TEST_AGENT);
    const co = await createCompany(agent);
    const res = await agent.patch(`/api/companies/${co.id}`).send({ sla_policy_id: null });
    expect(res.status).toBe(200);
    expect(res.body.sla_policy_id).toBeNull();
  });

  test('non-existent company — 404', async () => {
    const agent = await loginAs(TEST_AGENT);
    const res = await agent.patch('/api/companies/999999').send({ name: 'Ghost' });
    expect(res.status).toBe(404);
  });

  test('unauthenticated — 401', async () => {
    const res = await request(app).patch('/api/companies/1').send({ name: 'Anon' });
    expect(res.status).toBe(401);
  });
});

// ═══════════════════════════════════════════════════════════════
// DELETE /api/companies/:id
// ═══════════════════════════════════════════════════════════════
describe('DELETE /api/companies/:id', () => {
  test('admin deletes company — 200 { ok: true }', async () => {
    const admin = await loginAs(TEST_ADMIN);
    const co = await createCompany(admin);
    const res = await admin.delete(`/api/companies/${co.id}`);
    createdCompanyIds = createdCompanyIds.filter((id) => id !== co.id);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true });
  });

  test('non-existent company — 404', async () => {
    const admin = await loginAs(TEST_ADMIN);
    const res = await admin.delete('/api/companies/999999');
    expect(res.status).toBe(404);
  });

  test('agent — 403', async () => {
    const admin = await loginAs(TEST_ADMIN);
    const co = await createCompany(admin);
    const agent = await loginAs(TEST_AGENT);
    const res = await agent.delete(`/api/companies/${co.id}`);
    expect(res.status).toBe(403);
  });

  test('unauthenticated — 401', async () => {
    const res = await request(app).delete('/api/companies/1');
    expect(res.status).toBe(401);
  });
});

// ═══════════════════════════════════════════════════════════════
// GET /api/companies/:id/customers
// ═══════════════════════════════════════════════════════════════
describe('GET /api/companies/:id/customers', () => {
  test('returns customers array for the company', async () => {
    const agent = await loginAs(TEST_AGENT);
    const co = await createCompany(agent);

    // Insert a customer directly so we control the company_id
    const { rows } = await pool.query(
      `INSERT INTO customers (name, email, company_id) VALUES ($1,$2,$3) RETURNING id`,
      ['Test Customer', `cust${Date.now()}@example.com`, co.id]
    );
    createdCustomerIds.push(rows[0].id);

    const res = await agent.get(`/api/companies/${co.id}/customers`);
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('customers');
    expect(res.body.customers.some((c) => c.company_id === co.id)).toBe(true);
  });

  test('returns empty customers array for new company', async () => {
    const agent = await loginAs(TEST_AGENT);
    const co = await createCompany(agent);
    const res = await agent.get(`/api/companies/${co.id}/customers`);
    expect(res.status).toBe(200);
    expect(res.body.customers).toHaveLength(0);
  });

  test('unauthenticated — 401', async () => {
    const res = await request(app).get('/api/companies/1/customers');
    expect(res.status).toBe(401);
  });
});

// ═══════════════════════════════════════════════════════════════
// GET /api/companies/:id/tickets
// ═══════════════════════════════════════════════════════════════
describe('GET /api/companies/:id/tickets', () => {
  test('returns tickets for the company', async () => {
    const agent = await loginAs(TEST_AGENT);
    const co = await createCompany(agent);

    // Create a ticket linked to this company
    const ticketRes = await agent.post('/api/tickets').send({
      subject: 'Company ticket test subject',
      customerEmail: `co-ticket${Date.now()}@example.com`,
      category: 'General',
      priority: 'low',
      company_id: co.id,
    });
    if (ticketRes.body.id) createdTicketRefs.push(ticketRes.body.id);

    const res = await agent.get(`/api/companies/${co.id}/tickets`);
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('tickets');
    expect(Array.isArray(res.body.tickets)).toBe(true);
  });

  test('returns empty tickets array for new company', async () => {
    const agent = await loginAs(TEST_AGENT);
    const co = await createCompany(agent);
    const res = await agent.get(`/api/companies/${co.id}/tickets`);
    expect(res.status).toBe(200);
    expect(res.body.tickets).toHaveLength(0);
  });

  test('unauthenticated — 401', async () => {
    const res = await request(app).get('/api/companies/1/tickets');
    expect(res.status).toBe(401);
  });
});
