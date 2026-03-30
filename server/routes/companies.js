const express = require('express');
const router = express.Router();
const pool = require('../db');
const adminOnly = require('../middleware/adminOnly');

// ── GET /api/companies ────────────────────────────────────
// List all companies from the companies table with stats.
// Optional: ?search= (ILIKE on company name)
router.get('/', async (req, res) => {
  try {
    const values = [];
    let where = '';

    if (req.query.search?.trim()) {
      values.push(`%${req.query.search.trim()}%`);
      where = 'WHERE co.name ILIKE $1';
    }

    const { rows } = await pool.query(
      `SELECT co.*,
              COUNT(DISTINCT c.id)::int                                                AS customer_count,
              COUNT(DISTINCT t.id)::int                                                AS ticket_count,
              COUNT(DISTINCT t.id) FILTER (WHERE t.status IN ('open','pending'))::int  AS open_ticket_count
       FROM companies co
       LEFT JOIN customers c ON c.company_id = co.id
       LEFT JOIN tickets   t ON t.company_id = co.id
       ${where}
       GROUP BY co.id
       ORDER BY co.name ASC`,
      values
    );

    res.json({ companies: rows, total: rows.length });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch companies' });
  }
});

// ── GET /api/companies/suggest ────────────────────────────
// Typeahead endpoint — returns up to 8 companies matching a partial name.
// Must be declared before /:id routes so Express doesn't treat "suggest"
// as an id param.
router.get('/suggest', async (req, res) => {
  const q = req.query.q?.trim();
  if (!q) return res.json([]);

  try {
    const { rows } = await pool.query(
      `SELECT id, name, address, primary_contact, phone
       FROM companies
       WHERE name ILIKE $1
       ORDER BY name ASC
       LIMIT 8`,
      [`%${q}%`]
    );
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch suggestions' });
  }
});

// ── POST /api/companies ───────────────────────────────────
// Body: { name, address?, primary_contact?, phone? }
// 409 on duplicate name.
router.post('/', async (req, res) => {
  const { name, address, primary_contact, phone } = req.body;

  if (!name?.trim()) {
    return res.status(400).json({ error: 'name is required' });
  }

  try {
    const { rows } = await pool.query(
      `INSERT INTO companies (name, address, primary_contact, phone)
       VALUES ($1, $2, $3, $4)
       RETURNING *`,
      [
        name.trim(),
        address?.trim() || null,
        primary_contact?.trim() || null,
        phone?.trim() || null,
      ]
    );
    res.status(201).json({ ...rows[0], customer_count: 0, ticket_count: 0, open_ticket_count: 0 });
  } catch (err) {
    if (err.code === '23505') {
      return res.status(409).json({ error: 'A company with that name already exists' });
    }
    console.error(err);
    res.status(500).json({ error: 'Failed to create company' });
  }
});

// ── PATCH /api/companies/:id ──────────────────────────────
// Accepts any subset of { name, address, primary_contact, phone }.
router.patch('/:id', async (req, res) => {
  const allowed = ['name', 'address', 'primary_contact', 'phone'];
  const updates = {};

  for (const key of allowed) {
    if (req.body[key] !== undefined) {
      updates[key] = req.body[key] === null ? null : String(req.body[key]).trim() || null;
    }
  }

  if (!Object.keys(updates).length) {
    return res.status(400).json({ error: 'No valid fields to update' });
  }

  if (updates.name !== undefined && !updates.name) {
    return res.status(400).json({ error: 'name cannot be empty' });
  }

  const setClauses = Object.keys(updates).map((k, i) => `${k} = $${i + 1}`);
  const values = [...Object.values(updates), req.params.id];

  try {
    const { rows, rowCount } = await pool.query(
      `UPDATE companies SET ${setClauses.join(', ')} WHERE id = $${values.length} RETURNING *`,
      values
    );
    if (rowCount === 0) return res.status(404).json({ error: 'Company not found' });
    res.json(rows[0]);
  } catch (err) {
    if (err.code === '23505') {
      return res.status(409).json({ error: 'A company with that name already exists' });
    }
    console.error(err);
    res.status(500).json({ error: 'Failed to update company' });
  }
});

// ── DELETE /api/companies/:id ─────────────────────────────
// Admin only. Linked tickets/customers have their company_id set to NULL
// (ON DELETE SET NULL) — they are not deleted.
router.delete('/:id', adminOnly, async (req, res) => {
  try {
    const { rowCount } = await pool.query('DELETE FROM companies WHERE id = $1', [req.params.id]);
    if (rowCount === 0) return res.status(404).json({ error: 'Company not found' });
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to delete company' });
  }
});

// ── GET /api/companies/:id/customers ─────────────────────
router.get('/:id/customers', async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT c.id, c.name, c.email, c.phone, c.company, c.created_at,
              COUNT(t.id)::int AS ticket_count
       FROM customers c
       LEFT JOIN tickets t ON t.customer_email = c.email
       WHERE c.company_id = $1
       GROUP BY c.id
       ORDER BY c.name ASC`,
      [req.params.id]
    );
    res.json({ customers: rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch company customers' });
  }
});

// ── GET /api/companies/:id/tickets ───────────────────────
router.get('/:id/tickets', async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT t.ticket_ref, t.subject, t.customer_email, t.customer_name,
              t.status, t.priority, t.category, t.created_at,
              u.name AS assignee_name
       FROM tickets t
       LEFT JOIN users u ON u.id = t.assigned_to
       WHERE t.company_id = $1
       ORDER BY t.created_at DESC`,
      [req.params.id]
    );
    res.json({ tickets: rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch company tickets' });
  }
});

module.exports = router;
