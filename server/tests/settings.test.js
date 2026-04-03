'use strict';

const request = require('supertest');
const bcrypt = require('bcryptjs');
const app = require('../app');
const pool = require('../db');

const TEST_ADMIN = {
  email: 'settings-test-admin@example.com',
  name: 'Settings Test Admin',
  password: 'adminpass123',
  role: 'admin',
};

let adminId;
let originalSmtpHost;
let originalSmtpUser;
let originalSmtpFrom;

beforeAll(async () => {
  const hash = await bcrypt.hash(TEST_ADMIN.password, 10);
  const { rows } = await pool.query(
    `INSERT INTO users (email, name, password_hash, role) VALUES ($1,$2,$3,$4)
     ON CONFLICT (email) DO UPDATE SET password_hash = EXCLUDED.password_hash RETURNING id`,
    [TEST_ADMIN.email, TEST_ADMIN.name, hash, TEST_ADMIN.role]
  );
  adminId = rows[0].id;

  // Snapshot current SMTP settings so we can restore them after tests
  const { rows: settings } = await pool.query(
    `SELECT key, value FROM settings WHERE key IN ('smtp_host','smtp_user','smtp_from')`
  );
  const map = Object.fromEntries(settings.map((r) => [r.key, r.value]));
  originalSmtpHost = map.smtp_host ?? '';
  originalSmtpUser = map.smtp_user ?? '';
  originalSmtpFrom = map.smtp_from ?? '';
});

afterAll(async () => {
  // Restore original SMTP values
  for (const [key, value] of [
    ['smtp_host', originalSmtpHost],
    ['smtp_user', originalSmtpUser],
    ['smtp_from', originalSmtpFrom],
  ]) {
    await pool.query(
      `INSERT INTO settings (key, value) VALUES ($1, $2)
       ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`,
      [key, value]
    );
  }
  await pool.query('DELETE FROM users WHERE id = $1', [adminId]);
  await pool.end();
});

async function loginAs(creds) {
  const agent = request.agent(app);
  await agent.post('/api/auth/login').send({ email: creds.email, password: creds.password }).expect(200);
  return agent;
}

// ═══════════════════════════════════════════════════════════════
// GET /api/settings — SMTP fields
// ═══════════════════════════════════════════════════════════════
describe('GET /api/settings — SMTP fields', () => {
  test('response includes smtp_pass_set as a boolean, never a raw password', async () => {
    const admin = await loginAs(TEST_ADMIN);
    const res = await admin.get('/api/settings');

    expect(res.status).toBe(200);
    // smtp_pass must never appear in the response
    expect(res.body.smtp_pass).toBeUndefined();
    // smtp_pass_set must be a boolean
    expect(typeof res.body.smtp_pass_set).toBe('boolean');
  });

  test('response includes all smtp fields', async () => {
    const admin = await loginAs(TEST_ADMIN);
    const res = await admin.get('/api/settings');

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('smtp_host');
    expect(res.body).toHaveProperty('smtp_port');
    expect(res.body).toHaveProperty('smtp_user');
    expect(res.body).toHaveProperty('smtp_from');
    expect(res.body).toHaveProperty('support_email');
    expect(res.body).toHaveProperty('smtp_pass_set');
  });

  test('smtp_port is coerced to a number', async () => {
    const admin = await loginAs(TEST_ADMIN);
    const res = await admin.get('/api/settings');
    expect(typeof res.body.smtp_port).toBe('number');
  });
});

// ═══════════════════════════════════════════════════════════════
// PATCH /api/settings — SMTP fields
// ═══════════════════════════════════════════════════════════════
describe('PATCH /api/settings — SMTP fields', () => {
  test('admin can update smtp_host', async () => {
    const admin = await loginAs(TEST_ADMIN);
    const res = await admin.patch('/api/settings').send({ smtp_host: 'smtp.test.example.com' });
    expect(res.status).toBe(200);
    expect(res.body.smtp_host).toBe('smtp.test.example.com');
    // Password must still be hidden
    expect(res.body.smtp_pass).toBeUndefined();
  });

  test('admin can update smtp_user and smtp_from', async () => {
    const admin = await loginAs(TEST_ADMIN);
    const res = await admin.patch('/api/settings').send({
      smtp_user: 'mailer@test.example.com',
      smtp_from: 'noreply@test.example.com',
    });
    expect(res.status).toBe(200);
    expect(res.body.smtp_user).toBe('mailer@test.example.com');
    expect(res.body.smtp_from).toBe('noreply@test.example.com');
  });

  test('setting smtp_pass sets smtp_pass_set to true', async () => {
    const admin = await loginAs(TEST_ADMIN);
    const res = await admin.patch('/api/settings').send({ smtp_pass: 'secret-password-123' });
    expect(res.status).toBe(200);
    expect(res.body.smtp_pass_set).toBe(true);
    // The password value itself must never be returned
    expect(res.body.smtp_pass).toBeUndefined();
  });

  test('omitting smtp_pass in PATCH does not clear existing password', async () => {
    const admin = await loginAs(TEST_ADMIN);
    // Set a password first
    await admin.patch('/api/settings').send({ smtp_pass: 'original-password-99' }).expect(200);

    // Now PATCH without smtp_pass — should preserve the password
    await admin.patch('/api/settings').send({ smtp_host: 'smtp.preserve-test.com' }).expect(200);

    // smtp_pass_set should still be true
    const res = await admin.get('/api/settings');
    expect(res.body.smtp_pass_set).toBe(true);
  });

  test('sending empty smtp_pass does not clear existing password', async () => {
    const admin = await loginAs(TEST_ADMIN);
    await admin.patch('/api/settings').send({ smtp_pass: 'another-password-99' }).expect(200);

    // Send empty string — should be ignored
    await admin.patch('/api/settings').send({ smtp_pass: '' }).expect(200);

    const res = await admin.get('/api/settings');
    expect(res.body.smtp_pass_set).toBe(true);
  });

  test('admin can update support_email', async () => {
    const admin = await loginAs(TEST_ADMIN);
    const res = await admin.patch('/api/settings').send({ support_email: 'help@test.example.com' });
    expect(res.status).toBe(200);
    expect(res.body.support_email).toBe('help@test.example.com');
  });

  test('response always includes smtp_pass_set boolean, not raw password', async () => {
    const admin = await loginAs(TEST_ADMIN);
    const res = await admin.patch('/api/settings').send({ smtp_host: 'check-shape.example.com' });
    expect(res.status).toBe(200);
    expect(typeof res.body.smtp_pass_set).toBe('boolean');
    expect(res.body.smtp_pass).toBeUndefined();
  });
});
