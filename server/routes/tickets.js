const express = require('express');
const router = express.Router();
const pool = require('../db');

// ── helpers ───────────────────────────────────────────────────

// Shape a DB row into the format the frontend expects.
// The row may include assignee columns from a LEFT JOIN on users —
// we always emit the assignment fields so the frontend can rely on them.
function formatTicket(row, messages = [], events = []) {
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
    // Audit trail — chronological list of state transitions.
    // Empty array on list endpoint (events aren't fetched there),
    // populated by GET /api/tickets/:id.
    events: events.map((e) => ({
      id: e.id,
      eventType: e.event_type,
      fromValue: e.from_value ?? null,
      toValue: e.to_value ?? null,
      actorName: e.actor_name ?? null,
      actorEmail: e.actor_email ?? null,
      createdAt: e.created_at,
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

    // Run messages and events queries in parallel — they're independent.
    // Promise.all fires both immediately and resolves when both finish,
    // roughly halving the round-trip compared to sequential awaits.
    const [{ rows: msgRows }, { rows: eventRows }] = await Promise.all([
      pool.query(
        'SELECT * FROM messages WHERE ticket_id = $1 ORDER BY created_at ASC',
        [ticket.id]
      ),
      pool.query(
        'SELECT * FROM ticket_events WHERE ticket_id = $1 ORDER BY created_at ASC',
        [ticket.id]
      ),
    ]);

    res.json(formatTicket(ticket, msgRows, eventRows));
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

    const { rows } = await client.query(
      `INSERT INTO tickets (ticket_ref, subject, customer_email, category, priority, phone, company)
       VALUES ('TKT-' || LPAD(nextval('ticket_ref_seq')::TEXT, 3, '0'), $1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [
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
// Accepts: { status, priority, resolution, assigned_to }
// assigned_to must be an integer user ID (agent or admin role), or null to unassign.
//
// Audit trail: we fetch the current ticket row first ("old" state), apply the
// update, then diff old vs new to insert a ticket_events row for each field
// that actually changed. This "fetch → diff → update → log" is the standard
// pattern for change-detection in REST backends.
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

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // ── Step 1: fetch current state ("old" snapshot) ──────────
    // We need this to diff against the incoming body. Without it we can't
    // know whether a field actually changed (e.g. PATCH {status:'open'} on a
    // ticket that's already open — no real change, so no event should fire).
    const { rows: oldRows } = await client.query(
      `SELECT t.*,
              u.name  AS assignee_name,
              u.email AS assignee_email
       FROM tickets t
       LEFT JOIN users u ON u.id = t.assigned_to
       WHERE t.ticket_ref = $1`,
      [req.params.id]
    );
    if (oldRows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Ticket not found' });
    }
    const old = oldRows[0];

    // ── Step 2: apply the update ──────────────────────────────
    // Build SET clause dynamically: "status = $1, assigned_to = $2"
    const setClauses = Object.keys(updates).map((k, i) => `${k} = $${i + 1}`);
    const values = [...Object.values(updates), old.id];

    await client.query(
      `UPDATE tickets SET ${setClauses.join(', ')} WHERE id = $${values.length}`,
      values
    );

    // ── Step 3: fetch actor info for the event rows ───────────
    // req.session.userId comes from requireAuth middleware.
    // We snapshot name+email now so the events survive future user deletion.
    const actorId = req.session.userId;
    let actorName = null;
    let actorEmail = null;

    if (actorId) {
      const { rows: actorRows } = await client.query(
        'SELECT name, email FROM users WHERE id = $1',
        [actorId]
      );
      if (actorRows.length > 0) {
        actorName = actorRows[0].name;
        actorEmail = actorRows[0].email;
      }
    }

    // ── Step 4: diff old vs new and insert events ─────────────
    // Each condition only fires when the value genuinely changed —
    // we skip no-op patches (e.g. re-saving the same status).
    const eventInsert = `
      INSERT INTO ticket_events
        (ticket_id, actor_id, actor_name, actor_email, event_type, from_value, to_value)
      VALUES ($1, $2, $3, $4, $5, $6, $7)`;
    const baseParams = [old.id, actorId, actorName, actorEmail];

    // status changed?
    if (updates.status !== undefined && updates.status !== old.status) {
      await client.query(eventInsert, [
        ...baseParams, 'status_changed', old.status, updates.status,
      ]);
    }

    // priority changed?
    if (updates.priority !== undefined && updates.priority !== old.priority) {
      await client.query(eventInsert, [
        ...baseParams, 'priority_changed', old.priority, updates.priority,
      ]);
    }

    // assigned_to changed?
    if (updates.assigned_to !== undefined) {
      const oldAssignedTo = old.assigned_to ?? null;
      const newAssignedTo = updates.assigned_to;

      if (newAssignedTo !== oldAssignedTo) {
        if (newAssignedTo === null) {
          // Unassign — record who was previously assigned using the denormalized name
          await client.query(eventInsert, [
            ...baseParams, 'unassigned', old.assignee_name ?? String(oldAssignedTo), null,
          ]);
        } else {
          // Assign — look up the new assignee's name for the to_value snapshot
          const { rows: newAssigneeRows } = await client.query(
            'SELECT name FROM users WHERE id = $1',
            [newAssignedTo]
          );
          const newAssigneeName = newAssigneeRows[0]?.name ?? String(newAssignedTo);
          await client.query(eventInsert, [
            ...baseParams, 'assigned', old.assignee_name ?? null, newAssigneeName,
          ]);
        }
      }
    }

    // resolution set? (was null/empty, now has content)
    // We intentionally don't fire on every edit — only on the transition
    // from "no resolution" to "has resolution". Subsequent edits are just
    // content changes, not a meaningful state transition.
    if (
      updates.resolution !== undefined &&
      updates.resolution &&             // truthy: non-null, non-empty string
      !old.resolution                   // was previously empty/null
    ) {
      await client.query(eventInsert, [
        ...baseParams, 'resolution_set', null, null,
      ]);
    }

    await client.query('COMMIT');

    // ── Step 5: return fresh ticket with JOIN for assignee data ──
    const { rows: joined } = await pool.query(
      `SELECT t.*,
              u.name  AS assignee_name,
              u.email AS assignee_email
       FROM tickets t
       LEFT JOIN users u ON u.id = t.assigned_to
       WHERE t.id = $1`,
      [old.id]
    );
    res.json(formatTicket(joined[0]));
  } catch (err) {
    await client.query('ROLLBACK');
    console.error(err);
    res.status(500).json({ error: 'Failed to update ticket' });
  } finally {
    client.release();
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
