const express = require('express');
const router = express.Router();
const pool = require('../db');

// ── helpers ───────────────────────────────────────────────────

// Generate next ticket_ref by looking at the highest existing one
async function nextTicketRef(client) {
  const { rows } = await client.query(
    "SELECT ticket_ref FROM tickets ORDER BY id DESC LIMIT 1"
  );
  if (rows.length === 0) return 'TKT-001';
  const num = parseInt(rows[0].ticket_ref.replace('TKT-', ''), 10);
  return `TKT-${String(num + 1).padStart(3, '0')}`;
}

// Shape a DB row into the format the frontend expects
function formatTicket(row, messages = []) {
  return {
    id: row.ticket_ref,
    subject: row.subject,
    customerEmail: row.customer_email,
    category: row.category,
    priority: row.priority,
    status: row.status,
    createdAt: row.created_at,
    messages: messages.map((m) => ({
      from: m.from_addr,
      text: m.body,
      time: m.created_at,
    })),
  };
}

// ── GET /api/tickets ──────────────────────────────────────────
// Optional query params: ?status=open&priority=high
router.get('/', async (req, res) => {
  try {
    const conditions = [];
    const values = [];

    if (req.query.status) {
      values.push(req.query.status);
      conditions.push(`status = $${values.length}`);
    }
    if (req.query.priority) {
      values.push(req.query.priority);
      conditions.push(`priority = $${values.length}`);
    }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    const { rows } = await pool.query(
      `SELECT * FROM tickets ${where} ORDER BY created_at DESC`,
      values
    );

    res.json(rows.map((r) => formatTicket(r)));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch tickets' });
  }
});

// ── GET /api/tickets/:id ──────────────────────────────────────
// Returns the ticket with its messages embedded
router.get('/:id', async (req, res) => {
  try {
    const { rows: ticketRows } = await pool.query(
      'SELECT * FROM tickets WHERE ticket_ref = $1',
      [req.params.id]
    );
    if (ticketRows.length === 0) {
      return res.status(404).json({ error: 'Ticket not found' });
    }

    const ticket = ticketRows[0];
    const { rows: msgRows } = await pool.query(
      'SELECT * FROM messages WHERE ticket_id = $1 ORDER BY created_at ASC',
      [ticket.id]
    );

    res.json(formatTicket(ticket, msgRows));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch ticket' });
  }
});

// ── POST /api/tickets ─────────────────────────────────────────
router.post('/', async (req, res) => {
  const { subject, customerEmail, category, priority, initialMessage } = req.body;

  if (!subject?.trim() || !customerEmail?.trim()) {
    return res.status(400).json({ error: 'subject and customerEmail are required' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const ticketRef = await nextTicketRef(client);
    const { rows } = await client.query(
      `INSERT INTO tickets (ticket_ref, subject, customer_email, category, priority)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [
        ticketRef,
        subject.trim(),
        customerEmail.trim().toLowerCase(),
        category || 'General',
        priority || 'medium',
      ]
    );
    const ticket = rows[0];

    let messages = [];
    if (initialMessage?.trim()) {
      const { rows: msgRows } = await client.query(
        `INSERT INTO messages (ticket_id, from_addr, body)
         VALUES ($1, $2, $3)
         RETURNING *`,
        [ticket.id, customerEmail.trim().toLowerCase(), initialMessage.trim()]
      );
      messages = msgRows;
    }

    await client.query('COMMIT');
    res.status(201).json(formatTicket(ticket, messages));
  } catch (err) {
    await client.query('ROLLBACK');
    console.error(err);
    res.status(500).json({ error: 'Failed to create ticket' });
  } finally {
    client.release();
  }
});

// ── PATCH /api/tickets/:id ────────────────────────────────────
// Accepts: { status, priority } — updates only the fields provided
router.patch('/:id', async (req, res) => {
  const allowed = ['status', 'priority'];
  const updates = {};

  for (const key of allowed) {
    if (req.body[key] !== undefined) updates[key] = req.body[key];
  }

  if (Object.keys(updates).length === 0) {
    return res.status(400).json({ error: 'No valid fields to update' });
  }

  // Build SET clause dynamically: "status = $1, priority = $2"
  const setClauses = Object.keys(updates).map((k, i) => `${k} = $${i + 1}`);
  const values = [...Object.values(updates), req.params.id];

  try {
    const { rows } = await pool.query(
      `UPDATE tickets SET ${setClauses.join(', ')}
       WHERE ticket_ref = $${values.length}
       RETURNING *`,
      values
    );
    if (rows.length === 0) {
      return res.status(404).json({ error: 'Ticket not found' });
    }
    res.json(formatTicket(rows[0]));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to update ticket' });
  }
});

// ── POST /api/tickets/:id/messages ───────────────────────────
router.post('/:id/messages', async (req, res) => {
  const { from, text } = req.body;

  if (!from?.trim() || !text?.trim()) {
    return res.status(400).json({ error: 'from and text are required' });
  }

  try {
    const { rows: ticketRows } = await pool.query(
      'SELECT id FROM tickets WHERE ticket_ref = $1',
      [req.params.id]
    );
    if (ticketRows.length === 0) {
      return res.status(404).json({ error: 'Ticket not found' });
    }

    const { rows } = await pool.query(
      `INSERT INTO messages (ticket_id, from_addr, body)
       VALUES ($1, $2, $3)
       RETURNING *`,
      [ticketRows[0].id, from.trim(), text.trim()]
    );

    const msg = rows[0];
    res.status(201).json({ from: msg.from_addr, text: msg.body, time: msg.created_at });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to add message' });
  }
});

// ── DELETE /api/tickets/:id ───────────────────────────────
const adminOnly = require('../middleware/adminOnly');

router.delete('/:id', adminOnly, async (req, res) => {
  try {
    const { rowCount } = await pool.query(
      'DELETE FROM tickets WHERE ticket_ref = $1',
      [req.params.id]
    );
    if (rowCount === 0) return res.status(404).json({ error: 'Ticket not found' });
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to delete ticket' });
  }
});

module.exports = router;
