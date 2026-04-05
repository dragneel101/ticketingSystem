const express = require('express');
const router = express.Router();
const pool = require('../db');
const { computeSlaDeadlines } = require('../lib/slaUtils');
const { sendEmail, isEmailConfigured, getSupportEmail } = require('../lib/emailService');

// ── helpers ───────────────────────────────────────────────────

// Shape a DB row into the format the frontend expects.
// The row may include assignee columns from a LEFT JOIN on users —
// we always emit the assignment fields so the frontend can rely on them.
function formatTicket(row, messages = [], events = []) {
  return {
    id: row.ticket_ref,
    subject: row.subject,
    customerEmail: row.customer_email,
    customerName: row.customer_name ?? null,
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
    // SLA deadlines — null for tickets created before the SLA migration.
    firstResponseDueAt: row.first_response_due_at ?? null,
    resolutionDueAt:    row.resolution_due_at     ?? null,
    // Board assignment — null when unboarded
    boardId:   row.board_id   ?? null,
    boardName: row.board_name ?? null,
  };
}

// ── Email template: ticket created ───────────────────────────
// Generates a simple HTML notification for new ticket assignments.
// Inline styles because email clients strip <style> blocks.
function buildTicketCreatedHtml({ ticketRef, subject, customerName, customerEmail, priority, resolutionDueAt }) {
  const formattedDue = resolutionDueAt
    ? new Date(resolutionDueAt).toLocaleString('en-US', {
        weekday: 'short', year: 'numeric', month: 'short',
        day: 'numeric', hour: '2-digit', minute: '2-digit', timeZoneName: 'short',
      })
    : 'No SLA';

  const escHtml = (str) => String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

  return `
    <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; color: #1a1a2e;">
      <div style="background: #5b5ef4; color: #fff; padding: 16px 24px; border-radius: 6px 6px 0 0;">
        <strong style="font-size: 16px;">New Ticket Assigned: [${escHtml(ticketRef)}]</strong>
      </div>
      <div style="border: 1px solid #e2e8f0; border-top: none; padding: 24px; border-radius: 0 0 6px 6px;">
        <p style="margin: 0 0 16px;">A new ticket has been assigned to you.</p>
        <table style="width: 100%; border-collapse: collapse; font-size: 14px;">
          <tr>
            <td style="padding: 8px 12px; background: #f7fafc; font-weight: 600; width: 40%;">Ticket</td>
            <td style="padding: 8px 12px; border-bottom: 1px solid #e2e8f0;">${escHtml(ticketRef)}</td>
          </tr>
          <tr>
            <td style="padding: 8px 12px; background: #f7fafc; font-weight: 600;">Customer</td>
            <td style="padding: 8px 12px; border-bottom: 1px solid #e2e8f0;">${escHtml(customerName)} (${escHtml(customerEmail)})</td>
          </tr>
          <tr>
            <td style="padding: 8px 12px; background: #f7fafc; font-weight: 600;">Subject</td>
            <td style="padding: 8px 12px; border-bottom: 1px solid #e2e8f0;">${escHtml(subject)}</td>
          </tr>
          <tr>
            <td style="padding: 8px 12px; background: #f7fafc; font-weight: 600;">Priority</td>
            <td style="padding: 8px 12px; border-bottom: 1px solid #e2e8f0; text-transform: capitalize;">${escHtml(priority)}</td>
          </tr>
          <tr>
            <td style="padding: 8px 12px; background: #f7fafc; font-weight: 600;">Resolution due</td>
            <td style="padding: 8px 12px;">${escHtml(formattedDue)}</td>
          </tr>
        </table>
      </div>
    </div>
  `;
}

// ── Email template: ticket reassigned ────────────────────────
// Sent to the new assignee when a ticket's assigned_to changes.
function buildTicketAssignedHtml({ ticketRef, subject, customerName, customerEmail, priority, assignedByName }) {
  const escHtml = (str) => String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

  return `
    <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; color: #1a1a2e;">
      <div style="background: #5b5ef4; color: #fff; padding: 16px 24px; border-radius: 6px 6px 0 0;">
        <strong style="font-size: 16px;">Ticket Assigned to You: [${escHtml(ticketRef)}]</strong>
      </div>
      <div style="border: 1px solid #e2e8f0; border-top: none; padding: 24px; border-radius: 0 0 6px 6px;">
        <p style="margin: 0 0 16px;">${assignedByName ? `<strong>${escHtml(assignedByName)}</strong> has assigned a ticket to you.` : 'A ticket has been assigned to you.'}</p>
        <table style="width: 100%; border-collapse: collapse; font-size: 14px;">
          <tr>
            <td style="padding: 8px 12px; background: #f7fafc; font-weight: 600; width: 40%;">Ticket</td>
            <td style="padding: 8px 12px; border-bottom: 1px solid #e2e8f0;">${escHtml(ticketRef)}</td>
          </tr>
          <tr>
            <td style="padding: 8px 12px; background: #f7fafc; font-weight: 600;">Customer</td>
            <td style="padding: 8px 12px; border-bottom: 1px solid #e2e8f0;">${escHtml(customerName)} (${escHtml(customerEmail)})</td>
          </tr>
          <tr>
            <td style="padding: 8px 12px; background: #f7fafc; font-weight: 600;">Subject</td>
            <td style="padding: 8px 12px; border-bottom: 1px solid #e2e8f0;">${escHtml(subject)}</td>
          </tr>
          <tr>
            <td style="padding: 8px 12px; background: #f7fafc; font-weight: 600;">Priority</td>
            <td style="padding: 8px 12px; border-bottom: 1px solid #e2e8f0; text-transform: capitalize;">${escHtml(priority)}</td>
          </tr>
          ${assignedByName ? `
          <tr>
            <td style="padding: 8px 12px; background: #f7fafc; font-weight: 600;">Assigned by</td>
            <td style="padding: 8px 12px;">${escHtml(assignedByName)}</td>
          </tr>` : ''}
        </table>
      </div>
    </div>
  `;
}

// ── Email template: status changed ───────────────────────────
// Sent to the customer when a ticket's status changes.
function buildStatusChangedHtml({ ticketRef, subject, customerName, oldStatus, newStatus }) {
  const escHtml = (str) => String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

  return `
    <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; color: #1a1a2e;">
      <div style="background: #5b5ef4; color: #fff; padding: 16px 24px; border-radius: 6px 6px 0 0;">
        <strong style="font-size: 16px;">Ticket Status Updated: [${escHtml(ticketRef)}]</strong>
      </div>
      <div style="border: 1px solid #e2e8f0; border-top: none; padding: 24px; border-radius: 0 0 6px 6px;">
        <p style="margin: 0 0 16px;">Hi ${escHtml(customerName)}, the status of your support ticket has been updated.</p>
        <table style="width: 100%; border-collapse: collapse; font-size: 14px;">
          <tr>
            <td style="padding: 8px 12px; background: #f7fafc; font-weight: 600; width: 40%;">Ticket</td>
            <td style="padding: 8px 12px; border-bottom: 1px solid #e2e8f0;">${escHtml(ticketRef)}</td>
          </tr>
          <tr>
            <td style="padding: 8px 12px; background: #f7fafc; font-weight: 600;">Subject</td>
            <td style="padding: 8px 12px; border-bottom: 1px solid #e2e8f0;">${escHtml(subject)}</td>
          </tr>
          <tr>
            <td style="padding: 8px 12px; background: #f7fafc; font-weight: 600;">Previous Status</td>
            <td style="padding: 8px 12px; border-bottom: 1px solid #e2e8f0; text-transform: capitalize;">${escHtml(oldStatus)}</td>
          </tr>
          <tr>
            <td style="padding: 8px 12px; background: #f7fafc; font-weight: 600;">New Status</td>
            <td style="padding: 8px 12px; text-transform: capitalize;">${escHtml(newStatus)}</td>
          </tr>
        </table>
      </div>
    </div>
  `;
}

// ── Email template: new reply ─────────────────────────────────
// Sent to the customer when a non-internal message is posted on their ticket.
function buildNewReplyHtml({ ticketRef, subject, customerName, replyText }) {
  const escHtml = (str) => String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

  return `
    <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; color: #1a1a2e;">
      <div style="background: #5b5ef4; color: #fff; padding: 16px 24px; border-radius: 6px 6px 0 0;">
        <strong style="font-size: 16px;">New Reply on Your Ticket: [${escHtml(ticketRef)}]</strong>
      </div>
      <div style="border: 1px solid #e2e8f0; border-top: none; padding: 24px; border-radius: 0 0 6px 6px;">
        <p style="margin: 0 0 16px;">Hi ${escHtml(customerName)}, a new reply has been posted on your support ticket.</p>
        <table style="width: 100%; border-collapse: collapse; font-size: 14px;">
          <tr>
            <td style="padding: 8px 12px; background: #f7fafc; font-weight: 600; width: 40%;">Ticket</td>
            <td style="padding: 8px 12px; border-bottom: 1px solid #e2e8f0;">${escHtml(ticketRef)}</td>
          </tr>
          <tr>
            <td style="padding: 8px 12px; background: #f7fafc; font-weight: 600;">Subject</td>
            <td style="padding: 8px 12px; border-bottom: 1px solid #e2e8f0;">${escHtml(subject)}</td>
          </tr>
        </table>
        <div style="margin-top: 20px; padding: 16px; background: #f7fafc; border-left: 3px solid #5b5ef4; border-radius: 0 4px 4px 0; font-size: 14px; line-height: 1.6; white-space: pre-wrap;">${escHtml(replyText)}</div>
      </div>
    </div>
  `;
}

// ── GET /api/tickets ──────────────────────────────────────────
// Optional query params: ?status=open&priority=high&page=1&limit=25
router.get('/', async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 25));
    const offset = (page - 1) * limit;

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
    if (req.query.board_id) {
      values.push(req.query.board_id);
      conditions.push(`t.board_id = $${values.length}`);
    }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

    const [{ rows: countRows }, { rows }] = await Promise.all([
      pool.query(`SELECT COUNT(*) FROM tickets t ${where}`, values),
      pool.query(
        `SELECT t.*,
                u.name  AS assignee_name,
                u.email AS assignee_email,
                b.name  AS board_name
         FROM tickets t
         LEFT JOIN users  u ON u.id = t.assigned_to
         LEFT JOIN boards b ON b.id = t.board_id
         ${where}
         ORDER BY t.created_at DESC
         LIMIT $${values.length + 1} OFFSET $${values.length + 2}`,
        [...values, limit, offset]
      ),
    ]);

    const total = parseInt(countRows[0].count, 10);

    res.json({
      tickets: rows.map((r) => formatTicket(r)),
      total,
      page,
      limit,
      hasMore: offset + rows.length < total,
    });
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
      `SELECT t.*,
              u.name  AS assignee_name,
              u.email AS assignee_email,
              b.name  AS board_name
       FROM tickets t
       LEFT JOIN users  u ON u.id = t.assigned_to
       LEFT JOIN boards b ON b.id = t.board_id
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
  const { subject, customerEmail, customerName, category, priority, phone, company, companyId, boardId, initialMessage } = req.body;

  if (!subject?.trim() || !customerEmail?.trim()) {
    return res.status(400).json({ error: 'subject and customerEmail are required' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const { rows } = await client.query(
      `INSERT INTO tickets (ticket_ref, subject, customer_email, customer_name, category, priority, phone, company, company_id, board_id)
       VALUES ('TKT-' || LPAD(nextval('ticket_ref_seq')::TEXT, 3, '0'), $1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING *`,
      [
        subject.trim(),
        customerEmail.trim().toLowerCase(),
        customerName?.trim() || null,
        category || 'General',
        priority || 'medium',
        phone?.trim() || null,
        company?.trim() || null,
        companyId || null,
        boardId ? parseInt(boardId, 10) : null,
      ]
    );
    const ticket = rows[0];

    // ── Compute and store SLA deadlines ──────────────────────
    // Look up the effective SLA policy: company-specific if set, otherwise default.
    const { rows: policyRows } = await client.query(
      `SELECT sp.*
       FROM sla_policies sp
       WHERE sp.id = COALESCE(
         (SELECT sla_policy_id FROM companies WHERE id = $1),
         (SELECT id FROM sla_policies WHERE is_default = TRUE LIMIT 1)
       )
       LIMIT 1`,
      [companyId || null]
    );
    const { firstResponseDueAt, resolutionDueAt } = computeSlaDeadlines(
      ticket.priority,
      policyRows[0] ?? null,
      ticket.created_at
    );
    if (firstResponseDueAt || resolutionDueAt) {
      await client.query(
        'UPDATE tickets SET first_response_due_at = $1, resolution_due_at = $2 WHERE id = $3',
        [firstResponseDueAt, resolutionDueAt, ticket.id]
      );
      ticket.first_response_due_at = firstResponseDueAt;
      ticket.resolution_due_at     = resolutionDueAt;
    }

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

    // ── Fire-and-forget assignment notification ───────────────
    // We determine the recipient after committing so the ticket is fully
    // persisted before any async side-effect. sendEmail never throws, so
    // this cannot affect the HTTP response or rollback the transaction.
    if (isEmailConfigured()) {
      let recipientEmail = null;

      if (ticket.assigned_to) {
        // Ticket was created with an assignee — notify them directly.
        const { rows: assigneeRows } = await pool.query(
          'SELECT email FROM users WHERE id = $1',
          [ticket.assigned_to]
        );
        recipientEmail = assigneeRows[0]?.email ?? null;
      } else if (getSupportEmail()) {
        // Unassigned ticket — notify the configured support inbox so it
        // doesn't fall through the cracks. getSupportEmail() reads from
        // runtime config so DB-saved values are picked up without restart.
        recipientEmail = getSupportEmail();
      }

      if (recipientEmail) {
        // Intentionally not awaited — the HTTP response goes out immediately.
        // SMTP latency (often 200ms–2s) is unacceptable to block a POST on.
        sendEmail({
          to: recipientEmail,
          subject: `[${ticket.ticket_ref}] New ticket assigned: ${ticket.subject}`,
          html: buildTicketCreatedHtml({
            ticketRef:       ticket.ticket_ref,
            subject:         ticket.subject,
            customerName:    ticket.customer_name,
            customerEmail:   ticket.customer_email,
            priority:        ticket.priority,
            resolutionDueAt: ticket.resolution_due_at,
          }),
        });
      }
    }

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

  // board_id can be null (remove from board) or an integer
  if (req.body.board_id !== undefined) {
    const raw = req.body.board_id;
    updates.board_id = raw === null ? null : parseInt(raw, 10) || null;
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

    // priority changed? — recalculate SLA deadlines for the new priority
    if (updates.priority !== undefined && updates.priority !== old.priority) {
      await client.query(eventInsert, [
        ...baseParams, 'priority_changed', old.priority, updates.priority,
      ]);

      // Fetch the effective SLA policy and recompute deadlines.
      const { rows: policyRows } = await client.query(
        `SELECT sp.*
         FROM sla_policies sp
         WHERE sp.id = COALESCE(
           (SELECT sla_policy_id FROM companies WHERE id = $1),
           (SELECT id FROM sla_policies WHERE is_default = TRUE LIMIT 1)
         )
         LIMIT 1`,
        [old.company_id ?? null]
      );
      const { firstResponseDueAt, resolutionDueAt } = computeSlaDeadlines(
        updates.priority,
        policyRows[0] ?? null,
        old.created_at
      );
      // Reset sla_notified alongside the new deadline so the approaching-deadline
      // notifier fires again for the recalculated window. Without this reset,
      // a ticket that was already notified at high priority would stay silent
      // after being escalated to urgent with a tighter deadline.
      await client.query(
        'UPDATE tickets SET first_response_due_at = $1, resolution_due_at = $2, sla_notified = false WHERE id = $3',
        [firstResponseDueAt, resolutionDueAt, old.id]
      );
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

    // board changed?
    if (updates.board_id !== undefined && updates.board_id !== old.board_id) {
      // Look up board names for from/to values to keep the event self-contained
      const boardIds = [old.board_id, updates.board_id].filter(Boolean);
      let boardNames = {};
      if (boardIds.length) {
        const { rows: bRows } = await client.query(
          `SELECT id, name FROM boards WHERE id = ANY($1)`,
          [boardIds]
        );
        bRows.forEach((b) => { boardNames[b.id] = b.name; });
      }
      await client.query(eventInsert, [
        ...baseParams, 'board_changed',
        old.board_id ? (boardNames[old.board_id] ?? String(old.board_id)) : null,
        updates.board_id ? (boardNames[updates.board_id] ?? String(updates.board_id)) : null,
      ]);
    }

    await client.query('COMMIT');

    // ── Step 5: return fresh ticket with JOINs for assignee + board ──
    const { rows: joined } = await pool.query(
      `SELECT t.*,
              u.name  AS assignee_name,
              u.email AS assignee_email,
              b.name  AS board_name
       FROM tickets t
       LEFT JOIN users  u ON u.id = t.assigned_to
       LEFT JOIN boards b ON b.id = t.board_id
       WHERE t.id = $1`,
      [old.id]
    );

    // ── Fire-and-forget email notifications ───────────────────
    if (isEmailConfigured()) {
      const freshTicket = joined[0];

      // Reassignment: notify the new assignee when assigned_to changes to a non-null value
      const oldAssignedTo = old.assigned_to ?? null;
      const newAssignedTo = updates.assigned_to !== undefined ? updates.assigned_to : oldAssignedTo;
      if (
        updates.assigned_to !== undefined &&
        newAssignedTo !== null &&
        newAssignedTo !== oldAssignedTo
      ) {
        Promise.all([
          pool.query('SELECT email FROM users WHERE id = $1', [newAssignedTo]),
          pool.query('SELECT name FROM users WHERE id = $1', [req.session.userId]),
        ]).then(([{ rows: aRows }, { rows: actorRows }]) => {
          const assigneeEmail  = aRows[0]?.email;
          const assignedByName = actorRows[0]?.name ?? null;
          if (assigneeEmail) {
            sendEmail({
              to: assigneeEmail,
              subject: `[${freshTicket.ticket_ref}] Ticket assigned to you: ${freshTicket.subject}`,
              html: buildTicketAssignedHtml({
                ticketRef:      freshTicket.ticket_ref,
                subject:        freshTicket.subject,
                customerName:   freshTicket.customer_name,
                customerEmail:  freshTicket.customer_email,
                priority:       freshTicket.priority,
                assignedByName,
              }),
            });
          }
        }).catch(() => {});
      }

      // Status change: notify the customer when status changes
      if (updates.status !== undefined && updates.status !== old.status) {
        sendEmail({
          to: freshTicket.customer_email,
          subject: `[${freshTicket.ticket_ref}] Your ticket status has been updated`,
          html: buildStatusChangedHtml({
            ticketRef:    freshTicket.ticket_ref,
            subject:      freshTicket.subject,
            customerName: freshTicket.customer_name,
            oldStatus:    old.status,
            newStatus:    updates.status,
          }),
        });
      }
    }

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
  const { from, text, type, notify_customer } = req.body;

  if (!from?.trim() || !text?.trim()) {
    return res.status(400).json({ error: 'from and text are required' });
  }

  // Whitelist the two valid types. Default to 'message' if not provided
  // so existing callers that don't send a type still work correctly.
  const msgType = type === 'note' ? 'note' : 'message';

  try {
    const { rows: ticketRows } = await pool.query(
      'SELECT id, ticket_ref, subject, customer_email, customer_name FROM tickets WHERE ticket_ref = $1',
      [req.params.id]
    );
    if (ticketRows.length === 0) {
      return res.status(404).json({ error: 'Ticket not found' });
    }

    const ticketRow = ticketRows[0];

    const { rows } = await pool.query(
      `INSERT INTO messages (ticket_id, from_addr, body, type)
       VALUES ($1, $2, $3, $4)
       RETURNING *`,
      [ticketRow.id, from.trim(), text.trim(), msgType]
    );

    // ── Fire-and-forget customer notification ─────────────────
    // Only for non-internal messages — internal notes never surface to customers.
    if (msgType === 'message' && notify_customer !== false && isEmailConfigured()) {
      sendEmail({
        to: ticketRow.customer_email,
        subject: `[${ticketRow.ticket_ref}] New reply on your ticket: ${ticketRow.subject}`,
        html: buildNewReplyHtml({
          ticketRef:    ticketRow.ticket_ref,
          subject:      ticketRow.subject,
          customerName: ticketRow.customer_name,
          replyText:    text.trim(),
        }),
      });
    }

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
