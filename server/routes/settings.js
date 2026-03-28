const express = require('express');
const router = express.Router();
const pool = require('../db');
const adminOnly = require('../middleware/adminOnly');

// Both routes are behind adminOnly — non-admins get 403 before any DB work.

// ── GET /api/settings ─────────────────────────────────────────
// Returns all settings as a typed object. The client never sees raw strings;
// we coerce values to their proper types here so callers don't have to.
router.get('/', adminOnly, async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT key, value FROM settings');

    // Fold the rows into a single object, coercing known numeric keys.
    // Using reduce here instead of Object.fromEntries so we can apply
    // per-key type coercions in one pass without a second map.
    const settings = rows.reduce((acc, { key, value }) => {
      acc[key] = key === 'min_password_length' ? parseInt(value, 10) : value;
      return acc;
    }, {});

    res.json(settings);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch settings' });
  }
});

// ── PATCH /api/settings ───────────────────────────────────────
// Accepts { min_password_length: N }. Validates, updates, returns the full
// updated settings object (same shape as GET) so the client stays in sync.
router.patch('/', adminOnly, async (req, res) => {
  const { min_password_length } = req.body;

  // Validate before touching the DB. parseInt with radix 10 rejects floats
  // and strings; the isNaN guard catches NaN from non-numeric input.
  const parsed = parseInt(min_password_length, 10);
  if (isNaN(parsed) || parsed !== Number(min_password_length)) {
    return res.status(400).json({ error: 'min_password_length must be an integer' });
  }

  // Hard floor — enforced server-side so it cannot be bypassed via the API
  // directly, even if someone bypasses the UI entirely.
  const FLOOR = 10;
  if (parsed < FLOOR) {
    return res.status(400).json({ error: `min_password_length cannot be less than ${FLOOR}` });
  }

  try {
    // INSERT ... ON CONFLICT (upsert) means this works whether the row exists
    // or not — useful if the DB was set up without the seed data.
    await pool.query(
      `INSERT INTO settings (key, value) VALUES ('min_password_length', $1)
       ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`,
      [String(parsed)]
    );

    // Return the full settings object, same shape as GET.
    // This lets the client update all its state in one round-trip rather than
    // having to fire a separate GET after a successful PATCH.
    const { rows } = await pool.query('SELECT key, value FROM settings');
    const settings = rows.reduce((acc, { key, value }) => {
      acc[key] = key === 'min_password_length' ? parseInt(value, 10) : value;
      return acc;
    }, {});

    res.json(settings);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to update settings' });
  }
});

module.exports = router;
