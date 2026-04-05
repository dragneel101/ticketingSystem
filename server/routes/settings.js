const express = require('express');
const router = express.Router();
const pool = require('../db');
const adminOnly = require('../middleware/adminOnly');
const emailService = require('../lib/emailService');

// Both routes are behind adminOnly — non-admins get 403 before any DB work.

// ── Shared: build masked settings object from DB rows ─────────
// We fold the raw key/value rows into a typed object in one place so both
// GET and PATCH can return the exact same shape without duplicating logic.
//
// smtp_pass is NEVER included in the response — only smtp_pass_set (bool).
// This means the client can show "a password is saved" without the server
// ever leaking the credential, even in an internal admin UI.
function buildSettingsResponse(rows) {
  const raw = rows.reduce((acc, { key, value }) => {
    acc[key] = value;
    return acc;
  }, {});

  return {
    min_password_length: parseInt(raw.min_password_length || '10', 10),
    smtp_host:     raw.smtp_host     ?? '',
    smtp_port:     parseInt(raw.smtp_port || '587', 10),
    smtp_user:     raw.smtp_user     ?? '',
    smtp_pass_set: Boolean(raw.smtp_pass), // true/false — never the actual value
    smtp_from:     raw.smtp_from     ?? 'noreply@supportdesk.local',
    support_email: raw.support_email ?? '',
  };
}

// ── GET /api/settings ─────────────────────────────────────────
router.get('/', adminOnly, async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT key, value FROM settings');
    res.json(buildSettingsResponse(rows));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch settings' });
  }
});

// ── PATCH /api/settings ───────────────────────────────────────
// Accepts any subset of: min_password_length, smtp_host, smtp_port,
// smtp_user, smtp_pass, smtp_from, support_email.
//
// smtp_pass is only written to the DB when the submitted value is non-empty —
// sending the form without touching the password field preserves the existing
// saved password instead of wiping it.
//
// After saving, configure() is called so emailService picks up new credentials
// immediately without a server restart.
router.patch('/', adminOnly, async (req, res) => {
  const {
    min_password_length,
    smtp_host, smtp_port, smtp_user, smtp_pass, smtp_from, support_email,
  } = req.body;

  const upserts = []; // collect { key, value } pairs to upsert

  // ── min_password_length ───────────────────────────────────────
  if (min_password_length !== undefined) {
    const parsed = parseInt(min_password_length, 10);
    if (isNaN(parsed) || parsed !== Number(min_password_length)) {
      return res.status(400).json({ error: 'min_password_length must be an integer' });
    }
    const FLOOR = 10;
    if (parsed < FLOOR) {
      return res.status(400).json({ error: `min_password_length cannot be less than ${FLOOR}` });
    }
    upserts.push({ key: 'min_password_length', value: String(parsed) });
  }

  // ── SMTP fields — accept any string, including empty (to clear a value) ──
  if (smtp_host     !== undefined) upserts.push({ key: 'smtp_host',     value: String(smtp_host) });
  if (smtp_from     !== undefined) upserts.push({ key: 'smtp_from',     value: String(smtp_from) });
  if (smtp_user     !== undefined) upserts.push({ key: 'smtp_user',     value: String(smtp_user) });
  if (support_email !== undefined) upserts.push({ key: 'support_email', value: String(support_email) });

  if (smtp_port !== undefined) {
    const parsedPort = parseInt(smtp_port, 10);
    if (isNaN(parsedPort) || parsedPort < 1 || parsedPort > 65535) {
      return res.status(400).json({ error: 'smtp_port must be an integer between 1 and 65535' });
    }
    upserts.push({ key: 'smtp_port', value: String(parsedPort) });
  }

  // smtp_pass: only write to DB when the submitted value is non-empty.
  // An empty string means "user left the password field blank" — preserve existing.
  if (smtp_pass !== undefined && smtp_pass !== '') {
    upserts.push({ key: 'smtp_pass', value: String(smtp_pass) });
  }

  if (upserts.length === 0) {
    return res.status(400).json({ error: 'No valid fields to update' });
  }

  try {
    // Upsert each changed key individually. The ON CONFLICT pattern is the
    // same as the existing min_password_length upsert — safe whether the row
    // already exists or not.
    for (const { key, value } of upserts) {
      await pool.query(
        `INSERT INTO settings (key, value) VALUES ($1, $2)
         ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`,
        [key, value]
      );
    }

    // Re-fetch all rows so we can call configure() with a complete picture
    // of the current state (not just the fields that changed this request).
    const { rows } = await pool.query('SELECT key, value FROM settings');
    const raw = rows.reduce((acc, { key, value }) => { acc[key] = value; return acc; }, {});

    // Apply new config to emailService immediately — no restart required.
    // configure() only overwrites fields it receives, so we pass the full
    // current DB state. smtp_pass is always passed so it stays in sync.
    emailService.configure({
      host:         raw.smtp_host     || '',
      port:         parseInt(raw.smtp_port || '587', 10),
      user:         raw.smtp_user     || '',
      pass:         raw.smtp_pass     || '',
      from:         raw.smtp_from     || 'noreply@supportdesk.local',
      supportEmail: raw.support_email || '',
    });

    res.json(buildSettingsResponse(rows));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to update settings' });
  }
});

// ── POST /api/settings/test-email ────────────────────────────
// Sends a test email to verify SMTP configuration is working.
// Recipient defaults to support_email setting; body `{ to }` overrides.
// Returns { ok: true } on success, { error: '...' } on failure.
// Unlike other send calls this one awaits so the UI can show pass/fail.
router.post('/test-email', adminOnly, async (req, res) => {
  if (!emailService.isEmailConfigured()) {
    return res.status(400).json({ error: 'SMTP not configured' });
  }

  // Determine recipient: explicit `to` in body, else fall back to support_email setting
  let recipient = req.body?.to || emailService.getSupportEmail();
  if (!recipient) {
    return res.status(400).json({ error: 'No recipient: provide { to } or configure support_email' });
  }

  try {
    await emailService.sendEmailDirect({
      to: recipient,
      subject: 'SupportDesk — SMTP test email',
      html: `
        <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; color: #1a1a2e;">
          <div style="background: #5b5ef4; color: #fff; padding: 16px 24px; border-radius: 6px 6px 0 0;">
            <strong style="font-size: 16px;">SupportDesk SMTP Test</strong>
          </div>
          <div style="border: 1px solid #e2e8f0; border-top: none; padding: 24px; border-radius: 0 0 6px 6px;">
            <p style="margin: 0;">This is a test email sent from SupportDesk to verify your SMTP configuration is working correctly.</p>
          </div>
        </div>
      `,
    });
    res.json({ ok: true });
  } catch (err) {
    console.error('[test-email]', err);
    res.status(500).json({ error: err.message || 'Failed to send test email' });
  }
});

module.exports = router;
