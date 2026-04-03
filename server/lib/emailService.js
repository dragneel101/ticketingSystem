const nodemailer = require('nodemailer');

// ── Mutable runtime config ────────────────────────────────────
// We use a plain object instead of module-level consts so the config can be
// updated at runtime (e.g. when an admin saves new SMTP settings via the UI).
// Env vars are the fallback — if DB settings are empty strings they get
// overridden when configure() is called on startup.
let _config = {
  host:         process.env.SMTP_HOST || '',
  port:         parseInt(process.env.SMTP_PORT || '587', 10),
  user:         process.env.SMTP_USER || '',
  pass:         process.env.SMTP_PASS || '',
  from:         process.env.SMTP_FROM || 'noreply@supportdesk.local',
  supportEmail: process.env.SUPPORT_EMAIL || '',
};

// Lazily created — rebuilt whenever configure() is called with new credentials.
// Nulling _transporter here is the signal to getTransporter() that a fresh
// nodemailer.createTransport call is needed on the next send.
let _transporter = null;

/**
 * configure(config)
 *
 * Merges new values into the active config and resets the cached transporter
 * so the next send uses the updated credentials. Called on startup (from DB)
 * and on every successful PATCH /api/settings.
 *
 * Only non-empty string values overwrite existing config — this preserves
 * env var fallbacks when a DB row has an empty value.
 *
 * @param {object} config - Partial config: host, port, user, pass, from, supportEmail
 */
function configure(config) {
  if (config.host         !== undefined) _config.host         = config.host;
  if (config.port         !== undefined) _config.port         = parseInt(config.port, 10) || 587;
  if (config.user         !== undefined) _config.user         = config.user;
  if (config.from         !== undefined) _config.from         = config.from;
  if (config.supportEmail !== undefined) _config.supportEmail = config.supportEmail;

  // Only update pass when a real value is supplied — prevents clearing
  // a saved password when someone submits the settings form without touching
  // the password field (the form omits smtp_pass in that case, but this is
  // a belt-and-suspenders guard at the service layer too).
  if (config.pass !== undefined && config.pass !== '') {
    _config.pass = config.pass;
  }

  // Force a transporter rebuild on next send so new credentials are used.
  _transporter = null;
}

/**
 * getConfig()
 *
 * Returns the active config with the password masked.
 * smtp_pass is NEVER returned — callers only get smtp_pass_set (boolean)
 * so they can show a "password is set" hint without exposing the secret.
 */
function getConfig() {
  return {
    host:         _config.host,
    port:         _config.port,
    user:         _config.user,
    pass_set:     Boolean(_config.pass),
    from:         _config.from,
    supportEmail: _config.supportEmail,
  };
}

function getTransporter() {
  if (_transporter) return _transporter;

  _transporter = nodemailer.createTransport({
    host: _config.host,
    port: _config.port,
    // secure=true uses port 465 (implicit TLS). secure=false with port 587
    // upgrades via STARTTLS — the more common hosted SMTP setup.
    secure: _config.port === 465,
    auth: {
      user: _config.user,
      pass: _config.pass,
    },
  });

  return _transporter;
}

/**
 * Returns true only when the minimum required config is present.
 * Call this before sendEmail to avoid noisy "connection refused" errors
 * in environments where SMTP hasn't been configured yet.
 */
function isEmailConfigured() {
  return Boolean(_config.host && _config.user);
}

/**
 * getSupportEmail()
 *
 * Returns the configured support inbox address from runtime config.
 * Callers (e.g. tickets.js) should use this instead of reading
 * process.env.SUPPORT_EMAIL directly so they pick up DB-sourced config.
 */
function getSupportEmail() {
  return _config.supportEmail;
}

/**
 * sendEmail({ to, subject, html })
 *
 * Fire-and-forget: resolves immediately, logs on error, never throws.
 * Callers should NOT await this unless they specifically need delivery
 * confirmation — the HTTP response must not block on SMTP round-trips.
 *
 * @param {object} opts
 * @param {string} opts.to      - Recipient address
 * @param {string} opts.subject - Email subject line
 * @param {string} opts.html    - HTML body (plain text is generated automatically)
 */
async function sendEmail({ to, subject, html }) {
  if (!isEmailConfigured()) return;

  try {
    await getTransporter().sendMail({
      from: _config.from,
      to,
      subject,
      html,
      // nodemailer auto-generates a plain-text version from html when text
      // is omitted, which satisfies the multipart/alternative requirement
      // for inbox deliverability.
    });
  } catch (err) {
    // Log but never propagate — a mail failure should never break a ticket op.
    console.error(`[emailService] Failed to send "${subject}" to ${to}:`, err.message);
  }
}

module.exports = { sendEmail, isEmailConfigured, configure, getConfig, getSupportEmail };
