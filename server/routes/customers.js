const express = require('express');
const router = express.Router();
const pool = require('../db');

// ── GET /api/customers ────────────────────────────────────
// Optional: ?search= (ILIKE on name/email/company), ?page=, ?limit=
// Returns { customers, total, page, totalPages }
//
// ticket_count comes from a LEFT JOIN subquery rather than a correlated
// subquery in SELECT — the GROUP BY approach lets Postgres count all
// matching tickets in a single pass rather than one query per row.
router.get('/', async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 20));
    const offset = (page - 1) * limit;

    const values = [];
    let whereClause = '';

    if (req.query.search?.trim()) {
      values.push(`%${req.query.search.trim()}%`);
      // ILIKE = case-insensitive LIKE in Postgres — no need to lower() both sides
      whereClause = `WHERE c.name ILIKE $1 OR c.email ILIKE $1 OR c.company ILIKE $1`;
    }

    // Run count and data queries in parallel — they're independent reads.
    const [{ rows: countRows }, { rows }] = await Promise.all([
      pool.query(
        `SELECT COUNT(*) FROM customers c ${whereClause}`,
        values
      ),
      pool.query(
        `SELECT c.*,
                COUNT(t.id)::int AS ticket_count
         FROM customers c
         LEFT JOIN tickets t ON t.customer_email = c.email
         ${whereClause}
         GROUP BY c.id
         ORDER BY c.created_at DESC
         LIMIT $${values.length + 1} OFFSET $${values.length + 2}`,
        [...values, limit, offset]
      ),
    ]);

    const total = parseInt(countRows[0].count, 10);

    res.json({
      customers: rows,
      total,
      page,
      totalPages: Math.ceil(total / limit),
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch customers' });
  }
});

// ── POST /api/customers ───────────────────────────────────
// Body: { name, email, phone?, company?, company_id?, notes? }
// 409 on duplicate email — each email maps to exactly one customer record.
router.post('/', async (req, res) => {
  const { name, email, phone, company, company_id, notes } = req.body;

  if (!name?.trim() || !email?.trim()) {
    return res.status(400).json({ error: 'name and email are required' });
  }

  try {
    const { rows } = await pool.query(
      `INSERT INTO customers (name, email, phone, company, company_id, notes)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [
        name.trim(),
        email.trim().toLowerCase(),
        phone?.trim() || null,
        company?.trim() || null,
        company_id || null,
        notes?.trim() || null,
      ]
    );
    // Return the new row with ticket_count = 0 so the frontend can prepend it
    // to the list without a re-fetch — there can't be any tickets yet.
    res.status(201).json({ ...rows[0], ticket_count: 0 });
  } catch (err) {
    if (err.code === '23505') {
      // PostgreSQL unique_violation — email already exists
      return res.status(409).json({ error: 'A customer with that email already exists' });
    }
    console.error(err);
    res.status(500).json({ error: 'Failed to create customer' });
  }
});

// ── PATCH /api/customers/:id ──────────────────────────────
// Accepts any subset of { name, email, phone, company, notes }.
// 404 if not found, 409 on email conflict with a different customer.
router.patch('/:id', async (req, res) => {
  const allowed = ['name', 'email', 'phone', 'company', 'company_id', 'notes'];
  const updates = {};

  for (const key of allowed) {
    if (req.body[key] !== undefined) {
      // Allow explicit null to clear nullable fields (phone, company, notes).
      // For name/email, a null value will fail the NOT NULL constraint, which
      // is the right behavior — callers should send '' and we'll catch it below.
      updates[key] = req.body[key] === null ? null : req.body[key].trim();
    }
  }

  if (Object.keys(updates).length === 0) {
    return res.status(400).json({ error: 'No valid fields to update' });
  }

  if (updates.email !== undefined && !updates.email) {
    return res.status(400).json({ error: 'email cannot be empty' });
  }
  if (updates.name !== undefined && !updates.name) {
    return res.status(400).json({ error: 'name cannot be empty' });
  }

  // Normalize email to lowercase, same as POST
  if (updates.email) {
    updates.email = updates.email.toLowerCase();
  }

  const setClauses = Object.keys(updates).map((k, i) => `${k} = $${i + 1}`);
  const values = [...Object.values(updates), req.params.id];

  try {
    const { rows, rowCount } = await pool.query(
      `UPDATE customers SET ${setClauses.join(', ')}
       WHERE id = $${values.length}
       RETURNING *`,
      values
    );

    if (rowCount === 0) {
      return res.status(404).json({ error: 'Customer not found' });
    }

    res.json(rows[0]);
  } catch (err) {
    if (err.code === '23505') {
      return res.status(409).json({ error: 'A customer with that email already exists' });
    }
    console.error(err);
    res.status(500).json({ error: 'Failed to update customer' });
  }
});

// ── DELETE /api/customers/:id ─────────────────────────────
// Admin only — uses the same adminOnly middleware as DELETE /api/tickets/:id.
// The middleware re-queries the DB for the user's current role (freshness
// over caching) and returns 403 if the role isn't 'admin'.
const adminOnly = require('../middleware/adminOnly');

router.delete('/:id', adminOnly, async (req, res) => {
  try {
    const { rowCount } = await pool.query(
      'DELETE FROM customers WHERE id = $1',
      [req.params.id]
    );

    if (rowCount === 0) {
      return res.status(404).json({ error: 'Customer not found' });
    }

    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to delete customer' });
  }
});

// ── GET /api/customers/:id/tickets ───────────────────────
// Returns tickets belonging to this customer, matched by email.
// We look up the customer first to get their email — this keeps the join
// clean and returns a 404 if the customer id doesn't exist.
router.get('/:id/tickets', async (req, res) => {
  try {
    const { rows: custRows } = await pool.query(
      'SELECT email FROM customers WHERE id = $1',
      [req.params.id]
    );

    if (custRows.length === 0) {
      return res.status(404).json({ error: 'Customer not found' });
    }

    const { rows } = await pool.query(
      `SELECT id, ticket_ref, subject, status, priority, created_at
       FROM tickets
       WHERE customer_email = $1
       ORDER BY created_at DESC`,
      [custRows[0].email]
    );

    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch customer tickets' });
  }
});

module.exports = router;
