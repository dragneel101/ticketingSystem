'use strict';

const request = require('supertest');
const bcrypt = require('bcryptjs');
const app = require('../app');
const pool = require('../db');

const TEST_ADMIN = {
  email: 'boards-test-admin@example.com',
  name: 'Boards Test Admin',
  password: 'adminpass123',
  role: 'admin',
};

const TEST_AGENT = {
  email: 'boards-test-agent@example.com',
  name: 'Boards Test Agent',
  password: 'agentpass123',
  role: 'agent',
};

let adminId;
let agentId;
let createdBoardIds = [];

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
});

afterEach(async () => {
  if (createdBoardIds.length > 0) {
    await pool.query('DELETE FROM boards WHERE id = ANY($1)', [createdBoardIds]);
    createdBoardIds = [];
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

async function createBoard(adminAgent, name) {
  const res = await adminAgent.post('/api/boards').send({ name }).expect(201);
  createdBoardIds.push(res.body.id);
  return res.body;
}

// ═══════════════════════════════════════════════════════════════
// GET /api/boards
// ═══════════════════════════════════════════════════════════════
describe('GET /api/boards', () => {
  test('returns boards array with ticket_count for authenticated user', async () => {
    const agent = await loginAs(TEST_AGENT);
    const res = await agent.get('/api/boards');
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('boards');
    expect(Array.isArray(res.body.boards)).toBe(true);
  });

  test('each board has id, name, ticket_count', async () => {
    const admin = await loginAs(TEST_ADMIN);
    await createBoard(admin, `GET-shape-board-${Date.now()}`);
    const agent = await loginAs(TEST_AGENT);
    const res = await agent.get('/api/boards');
    const board = res.body.boards.find((b) => createdBoardIds.includes(b.id));
    expect(board).toHaveProperty('id');
    expect(board).toHaveProperty('name');
    expect(board).toHaveProperty('ticket_count');
    expect(typeof board.ticket_count).toBe('number');
  });

  test('unauthenticated — 401', async () => {
    const res = await request(app).get('/api/boards');
    expect(res.status).toBe(401);
  });
});

// ═══════════════════════════════════════════════════════════════
// POST /api/boards
// ═══════════════════════════════════════════════════════════════
describe('POST /api/boards', () => {
  test('admin creates a board — 201 with board object', async () => {
    const admin = await loginAs(TEST_ADMIN);
    const name = `New Board ${Date.now()}`;
    const res = await admin.post('/api/boards').send({ name });
    createdBoardIds.push(res.body.id);
    expect(res.status).toBe(201);
    expect(res.body.name).toBe(name);
    expect(res.body.ticket_count).toBe(0);
  });

  test('missing name — 400', async () => {
    const admin = await loginAs(TEST_ADMIN);
    const res = await admin.post('/api/boards').send({});
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/name is required/i);
  });

  test('duplicate name — 409', async () => {
    const admin = await loginAs(TEST_ADMIN);
    const name = `Dupe Board ${Date.now()}`;
    await createBoard(admin, name);
    const res = await admin.post('/api/boards').send({ name });
    expect(res.status).toBe(409);
  });

  test('agent — 403', async () => {
    const agent = await loginAs(TEST_AGENT);
    const res = await agent.post('/api/boards').send({ name: 'Agent Board' });
    expect(res.status).toBe(403);
  });

  test('unauthenticated — 401', async () => {
    const res = await request(app).post('/api/boards').send({ name: 'Anon Board' });
    expect(res.status).toBe(401);
  });
});

// ═══════════════════════════════════════════════════════════════
// PATCH /api/boards/:id
// ═══════════════════════════════════════════════════════════════
describe('PATCH /api/boards/:id', () => {
  test('admin renames a board — returns updated board', async () => {
    const admin = await loginAs(TEST_ADMIN);
    const board = await createBoard(admin, `Rename Me ${Date.now()}`);
    const newName = `Renamed ${Date.now()}`;
    const res = await admin.patch(`/api/boards/${board.id}`).send({ name: newName });
    expect(res.status).toBe(200);
    expect(res.body.name).toBe(newName);
  });

  test('missing name — 400', async () => {
    const admin = await loginAs(TEST_ADMIN);
    const board = await createBoard(admin, `Patch No Name ${Date.now()}`);
    const res = await admin.patch(`/api/boards/${board.id}`).send({});
    expect(res.status).toBe(400);
  });

  test('non-existent board — 404', async () => {
    const admin = await loginAs(TEST_ADMIN);
    const res = await admin.patch('/api/boards/999999').send({ name: 'Ghost' });
    expect(res.status).toBe(404);
  });

  test('agent — 403', async () => {
    const admin = await loginAs(TEST_ADMIN);
    const board = await createBoard(admin, `Agent Patch ${Date.now()}`);
    const agent = await loginAs(TEST_AGENT);
    const res = await agent.patch(`/api/boards/${board.id}`).send({ name: 'New Name' });
    expect(res.status).toBe(403);
  });

  test('unauthenticated — 401', async () => {
    const res = await request(app).patch('/api/boards/1').send({ name: 'Anon' });
    expect(res.status).toBe(401);
  });
});

// ═══════════════════════════════════════════════════════════════
// DELETE /api/boards/:id
// ═══════════════════════════════════════════════════════════════
describe('DELETE /api/boards/:id', () => {
  test('admin deletes a board — 200 { ok: true }', async () => {
    const admin = await loginAs(TEST_ADMIN);
    const board = await createBoard(admin, `Delete Me ${Date.now()}`);
    const res = await admin.delete(`/api/boards/${board.id}`);
    createdBoardIds = createdBoardIds.filter((id) => id !== board.id);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true });
  });

  test('non-existent board — 404', async () => {
    const admin = await loginAs(TEST_ADMIN);
    const res = await admin.delete('/api/boards/999999');
    expect(res.status).toBe(404);
  });

  test('agent — 403', async () => {
    const admin = await loginAs(TEST_ADMIN);
    const board = await createBoard(admin, `Agent Delete ${Date.now()}`);
    const agent = await loginAs(TEST_AGENT);
    const res = await agent.delete(`/api/boards/${board.id}`);
    expect(res.status).toBe(403);
  });

  test('unauthenticated — 401', async () => {
    const res = await request(app).delete('/api/boards/1');
    expect(res.status).toBe(401);
  });
});
