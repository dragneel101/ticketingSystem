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

// Shape a DB row into the format the frontend expects.
// The row may include assignee columns from a LEFT JOIN on users —
// we always emit the assignment fields so the frontend can rely on them.
function formatTicket(row, messages = []) {
  return {
    id: row.ticket_ref,
    subject: row.subject,
    customerEmail: row.customer_email,
    // Nullable contact fields — null when not yet set
    phone: row.phone ?? null,
    company: row.company ?? null,
    category: row.category,
    priority: row.priority,
    status: row.status,
    createdAt: row.created_at,
    resolution: row.resolution ?? null,
    // Assignment: null when unassigned, populated by JOIN when assigned
    assignedTo: row.assigned_to ?? null,
    assigneeName: row.assignee_name ?? null,
    assigneeEmail: row.assignee_email ?? null,
    // Each message includes its type ('message' | 'note') so the frontend
    // can filter to the correct tab without a second request.
    messages: messages.map((m) => ({
      from: m.from_addr,
      text: m.body,
      time: m.created_at,
      type: m.type ?? 'message',
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
      conditions.push(`t.status = $${values.length}`);
    }
    if (req.query.priority) {
      values.push(req.query.priority);
      conditions.push(`t.priority = $${values.length}`);
    }

    // Prefix WHERE conditions with "t." now that we're joining tables.
    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    const { rows } = await pool.query(
      // LEFT JOIN so tickets without an assignee are still returned.
      // u.name and u.email are aliased to avoid colliding with ticket columns.
      `SELECT t.*,
              u.name  AS assignee_name,
              u.email AS assignee_email
       FROM tickets t
       LEFT JOIN users u ON u.id = t.assigned_to
       ${where}
       ORDER BY t.created_at DESC`,
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
      // Same LEFT JOIN as the list endpoint — consistent shape for formatTicket
      `SELECT t.*,
              u.name  AS assignee_name,
              u.email AS assignee_email
       FROM tickets t
       LEFT JOIN users u ON u.id = t.assigned_to
       WHERE t.ticket_ref = $1`,
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
  const { subject, customerEmail, category, priority, phone, company, initialMessage } = req.body;

  if (!subject?.trim() || !customerEmail?.trim()) {
    return res.status(400).json({ error: 'subject and customerEmail are required' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const ticketRef = await nextTicketRef(client);
    const { rows } = await client.query(
      `INSERT INTO tickets (ticket_ref, subject, customer_email, category, priority, phone, company)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING *`,
      [
        ticketRef,
        subject.trim(),
        customerEmail.trim().toLowerCase(),
        category || 'General',
        priority || 'medium',
        phone?.trim() || null,
        company?.trim() || null,
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
// Accepts: { status, priority, assigned_to } — updates only the fields provided.
// assigned_to must be an integer user ID (agent or admin role), or null to unassign.
router.patch('/:id', async (req, res) => {
  // resolution is a free-text field — no special validation needed beyond
  // accepting null (clear it) or a string (set it).
  const allowed = ['status', 'priority', 'resolution'];
  const updates = {};

  for (const key of allowed) {
    if (req.body[key] !== undefined) updates[key] = req.body[key];
  }

  // Handle assigned_to separately: it can be null (unassign) or an integer (assign).
  // We can't include it in the simple `allowed` loop because null is a valid value
  // and needs distinct handling — an undefined check would incorrectly allow null
  // through for the other fields.
  if (req.body.assigned_to !== undefined) {
    const rawId = req.body.assigned_to;

    if (rawId === null) {
      // Explicit unassign — always valid, no DB lookup needed
      updates.assigned_to = null;
    } else {
      const userId = parseInt(rawId, 10);
      if (isNaN(userId)) {
        return res.status(400).json({ error: 'assigned_to must be an integer user ID or null' });
      }

      // Server-side role validation: only agents and admins can be assigned tickets.
      // The frontend only shows these roles in the dropdown, but any authenticated
      // user can send a raw PATCH — this check is the real gate.
      try {
        const { rows: userRows } = await pool.query(
          `SELECT id, role FROM users WHERE id = $1`,
          [userId]
        );
        if (userRows.length === 0) {
          return res.status(400).json({ error: 'Assignee user not found' });
        }
        if (!['agent', 'admin'].includes(userRows[0].role)) {
          return res.status(400).json({ error: 'Assignee must be an agent or admin' });
        }
        updates.assigned_to = userId;
      } catch (err) {
        console.error(err);
        return res.status(500).json({ error: 'Failed to validate assignee' });
      }
    }
  }

  if (Object.keys(updates).length === 0) {
    return res.status(400).json({ error: 'No valid fields to update' });
  }

  // Build SET clause dynamically: "status = $1, assigned_to = $2"
  const setClauses = Object.keys(updates).map((k, i) => `${k} = $${i + 1}`);
  const values = [...Object.values(updates), req.params.id];

  try {
    // After updating, re-JOIN users so the response includes fresh assignee data —
    // same shape as GET endpoints so the frontend state merge works cleanly.
    const { rows } = await pool.query(
      `UPDATE tickets SET ${setClauses.join(', ')}
       WHERE ticket_ref = $${values.length}
       RETURNING *`,
      values
    );
    if (rows.length === 0) {
      return res.status(404).json({ error: 'Ticket not found' });
    }

    // Fetch with JOIN to get assignee name/email in the response
    const { rows: joined } = await pool.query(
      `SELECT t.*,
              u.name  AS assignee_name,
              u.email AS assignee_email
       FROM tickets t
       LEFT JOIN users u ON u.id = t.assigned_to
       WHERE t.id = $1`,
      [rows[0].id]
    );
    res.json(formatTicket(joined[0]));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to update ticket' });
  }
});

// ── POST /api/tickets/:id/messages ───────────────────────────
router.post('/:id/messages', async (req, res) => {
  const { from, text, type } = req.body;

  if (!from?.trim() || !text?.trim()) {
    return res.status(400).json({ error: 'from and text are required' });
  }

  // Whitelist the two valid types. Default to 'message' if not provided
  // so existing callers that don't send a type still work correctly.
  const msgType = type === 'note' ? 'note' : 'message';

  try {
    const { rows: ticketRows } = await pool.query(
      'SELECT id FROM tickets WHERE ticket_ref = $1',
      [req.params.id]
    );
    if (ticketRows.length === 0) {
      return res.status(404).json({ error: 'Ticket not found' });
    }

    const { rows } = await pool.query(
      `INSERT INTO messages (ticket_id, from_addr, body, type)
       VALUES ($1, $2, $3, $4)
       RETURNING *`,
      [ticketRows[0].id, from.trim(), text.trim(), msgType]
    );

    const msg = rows[0];
    res.status(201).json({
      from: msg.from_addr,
      text: msg.body,
      time: msg.created_at,
      type: msg.type,
    });
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
