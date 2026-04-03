const pool = require('../db');
const { sendEmail, isEmailConfigured, getSupportEmail } = require('./emailService');

// ── Email template: SLA approaching ──────────────────────────
// Generates a simple HTML email. We use inline styles because many
// email clients (Outlook, Gmail) strip <style> blocks entirely.
function buildSlaWarningHtml({ ticketRef, subject, customerName, priority, resolutionDueAt, minutesRemaining }) {
  const formattedDue = new Date(resolutionDueAt).toLocaleString('en-US', {
    weekday: 'short', year: 'numeric', month: 'short',
    day: 'numeric', hour: '2-digit', minute: '2-digit', timeZoneName: 'short',
  });

  return `
    <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; color: #1a1a2e;">
      <div style="background: #e53e3e; color: #fff; padding: 16px 24px; border-radius: 6px 6px 0 0;">
        <strong style="font-size: 16px;">SLA Resolution Deadline Approaching</strong>
      </div>
      <div style="border: 1px solid #e2e8f0; border-top: none; padding: 24px; border-radius: 0 0 6px 6px;">
        <p style="margin: 0 0 16px;">A ticket is approaching its SLA resolution deadline.</p>
        <table style="width: 100%; border-collapse: collapse; font-size: 14px;">
          <tr>
            <td style="padding: 8px 12px; background: #f7fafc; font-weight: 600; width: 40%;">Ticket</td>
            <td style="padding: 8px 12px; border-bottom: 1px solid #e2e8f0;">${ticketRef}</td>
          </tr>
          <tr>
            <td style="padding: 8px 12px; background: #f7fafc; font-weight: 600;">Subject</td>
            <td style="padding: 8px 12px; border-bottom: 1px solid #e2e8f0;">${escapeHtml(subject)}</td>
          </tr>
          <tr>
            <td style="padding: 8px 12px; background: #f7fafc; font-weight: 600;">Customer</td>
            <td style="padding: 8px 12px; border-bottom: 1px solid #e2e8f0;">${escapeHtml(customerName || 'Unknown')}</td>
          </tr>
          <tr>
            <td style="padding: 8px 12px; background: #f7fafc; font-weight: 600;">Priority</td>
            <td style="padding: 8px 12px; border-bottom: 1px solid #e2e8f0; text-transform: capitalize;">${escapeHtml(priority)}</td>
          </tr>
          <tr>
            <td style="padding: 8px 12px; background: #f7fafc; font-weight: 600;">Resolution due</td>
            <td style="padding: 8px 12px; border-bottom: 1px solid #e2e8f0;">${formattedDue}</td>
          </tr>
          <tr>
            <td style="padding: 8px 12px; background: #f7fafc; font-weight: 600;">Time remaining</td>
            <td style="padding: 8px 12px; color: #e53e3e; font-weight: 700;">${minutesRemaining} minutes</td>
          </tr>
        </table>
      </div>
    </div>
  `;
}

// Minimal HTML escaping — prevents subject/customer name injection into the email body.
function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// ── Core notifier tick ────────────────────────────────────────
// Called on every interval. Finds all tickets whose resolution deadline
// falls within the next 60 minutes and haven't been notified yet, then
// sends one email per ticket and marks the row so it won't fire again.
async function checkSlaDeadlines() {
  // The WHERE clause uses a half-open interval: [NOW, NOW + 60 min).
  // "sla_notified = false" is the idempotency gate — once we flip it to
  // true we never re-send for the same deadline window.
  // We JOIN users to get the assignee's email in a single query.
  const { rows } = await pool.query(`
    SELECT
      t.id,
      t.ticket_ref,
      t.subject,
      t.customer_name,
      t.priority,
      t.resolution_due_at,
      u.email AS assignee_email,
      u.name  AS assignee_name
    FROM tickets t
    LEFT JOIN users u ON u.id = t.assigned_to
    WHERE
      t.resolution_due_at >= NOW()
      AND t.resolution_due_at <= NOW() + INTERVAL '60 minutes'
      AND t.status NOT IN ('resolved', 'closed')
      AND t.sla_notified = false
  `);

  for (const ticket of rows) {
    const minutesRemaining = Math.round(
      (new Date(ticket.resolution_due_at) - Date.now()) / 60_000
    );

    // Recipient: assignee if present, otherwise fall back to the configured
    // support address. If neither exists, skip — no point sending to nowhere.
    // getSupportEmail() reads from the runtime config (DB-sourced or env var),
    // so this picks up changes saved via the admin settings UI without a restart.
    const recipient =
      ticket.assignee_email ||
      getSupportEmail() ||
      null;

    if (!recipient) continue;

    const subject = `SLA Warning: [${ticket.ticket_ref}] resolution due in ${minutesRemaining} minutes`;

    await sendEmail({
      to: recipient,
      subject,
      html: buildSlaWarningHtml({
        ticketRef:        ticket.ticket_ref,
        subject:          ticket.subject,
        customerName:     ticket.customer_name,
        priority:         ticket.priority,
        resolutionDueAt:  ticket.resolution_due_at,
        minutesRemaining,
      }),
    });

    // Mark as notified immediately after the send attempt (not inside sendEmail)
    // so we don't re-query this ticket on the next tick even if the send failed.
    // A failed send is still "attempted" — we log the error in sendEmail and move on.
    await pool.query(
      'UPDATE tickets SET sla_notified = true WHERE id = $1',
      [ticket.id]
    );
  }
}

/**
 * startSlaNotifier(intervalMs?)
 *
 * Kicks off the background polling loop. Call once from index.js after
 * app.listen() so it only runs in the live server process (not in tests).
 *
 * @param {number} [intervalMs=300000] - Poll interval in ms (default: 5 min)
 */
function startSlaNotifier(intervalMs = 5 * 60 * 1000) {
  if (!isEmailConfigured()) {
    console.log('[slaNotifier] SMTP not configured — SLA email notifications disabled');
    return;
  }

  console.log(`[slaNotifier] Starting — checking every ${intervalMs / 1000}s`);

  setInterval(async () => {
    try {
      await checkSlaDeadlines();
    } catch (err) {
      // Log but keep the interval alive. A single DB hiccup shouldn't
      // kill the notifier for the rest of the process lifetime.
      console.error('[slaNotifier] Error during SLA check:', err.message);
    }
  }, intervalMs);
}

module.exports = { startSlaNotifier };
