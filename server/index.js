const app = require('./app');
const pool = require('./db');
const { configure } = require('./lib/emailService');
const { startSlaNotifier, reconfigureSlaNotifier } = require('./lib/slaNotifier');

const PORT = process.env.PORT || 3000;

app.listen(PORT, async () => {
  console.log(`Server running on http://localhost:${PORT}`);

  // ── Load SMTP settings from DB on startup ─────────────────────
  // This lets admins configure email via the UI without needing to set env vars
  // or restart the server. Env vars are the initial fallback (set in emailService.js).
  // We do this after listen() so a DB failure here doesn't prevent the server
  // from starting (the env var fallback remains active in that case).
  try {
    const { rows } = await pool.query(
      `SELECT key, value FROM settings
       WHERE key IN ('smtp_host','smtp_port','smtp_user','smtp_pass','smtp_from','support_email')`
    );

    if (rows.length > 0) {
      // Fold rows into a flat config object — same pattern used in settings.js
      const raw = rows.reduce((acc, { key, value }) => { acc[key] = value; return acc; }, {});

      configure({
        host:         raw.smtp_host     || '',
        port:         parseInt(raw.smtp_port || '587', 10),
        user:         raw.smtp_user     || '',
        pass:         raw.smtp_pass     || '',
        from:         raw.smtp_from     || 'noreply@supportdesk.local',
        supportEmail: raw.support_email || '',
      });

      // Override notifier interval if set in DB
      if (raw.sla_check_interval_minutes) {
        reconfigureSlaNotifier(parseInt(raw.sla_check_interval_minutes, 10));
      }

      console.log('[emailService] SMTP config loaded from database');
    }
  } catch (err) {
    // Non-fatal: env var config (if any) remains active. The admin can
    // re-save settings via the UI to trigger another configure() call.
    console.warn('[emailService] Could not load SMTP config from DB on startup:', err.message);
  }

  // Start the SLA warning notifier after the server is bound and SMTP is
  // configured so it only runs in the live server process (not in tests).
  startSlaNotifier();
});
