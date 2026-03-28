const express = require('express');
const bcrypt = require('bcryptjs');
const router = express.Router();
const pool = require('../db');

// ── POST /api/auth/login ──────────────────────────────────────
// Accepts { email, password }. Returns { id, email, name } on success.
router.post('/login', async (req, res) => {
  const { email, password } = req.body;

  if (!email?.trim() || !password) {
    return res.status(400).json({ error: 'email and password are required' });
  }

  try {
    const { rows } = await pool.query(
      'SELECT * FROM users WHERE email = $1',
      [email.trim().toLowerCase()]
    );

    const user = rows[0];

    // Use bcrypt.compare even when user doesn't exist — this prevents timing
    // attacks that would reveal whether an email is registered by measuring
    // how long the response takes (real compare vs. instant reject).
    const passwordToCheck = password;
    const hashToCheck = user?.password_hash ?? '$2b$12$invalidhashtopreventtimingattack';
    const match = await bcrypt.compare(passwordToCheck, hashToCheck);

    if (!user || !match) {
      // Deliberately vague — don't reveal whether the email exists
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    // Regenerate session ID on login to prevent session fixation.
    // Session fixation: attacker shares a known session ID with victim before
    // they log in; if we don't rotate it, the attacker can use that same ID
    // post-login to impersonate the victim.
    req.session.regenerate((err) => {
      if (err) {
        console.error('Session regenerate error', err);
        return res.status(500).json({ error: 'Session error' });
      }

      req.session.userId = user.id;

      // save() forces the session to persist before we send the response,
      // avoiding a race condition where the cookie is sent before the session
      // is written to the database.
      req.session.save((saveErr) => {
        if (saveErr) {
          console.error('Session save error', saveErr);
          return res.status(500).json({ error: 'Session error' });
        }
        res.json({ id: user.id, email: user.email, name: user.name, role: user.role });
      });
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Login failed' });
  }
});

// ── POST /api/auth/logout ─────────────────────────────────────
router.post('/logout', (req, res) => {
  req.session.destroy((err) => {
    if (err) {
      console.error('Session destroy error', err);
      return res.status(500).json({ error: 'Logout failed' });
    }
    // Clear the cookie on the client side too
    res.clearCookie('connect.sid');
    res.json({ ok: true });
  });
});

// ── GET /api/auth/me ──────────────────────────────────────────
// Returns the currently logged-in user, or 401 if not authenticated.
// The frontend calls this on startup to rehydrate auth state.
router.get('/me', async (req, res) => {
  if (!req.session.userId) {
    return res.json({ user: null });
  }

  try {
    const { rows } = await pool.query(
      'SELECT id, email, name, role FROM users WHERE id = $1',
      [req.session.userId]
    );

    if (rows.length === 0) {
      // User was deleted while they had an active session
      req.session.destroy(() => {});
      return res.json({ user: null });
    }

    res.json({ user: rows[0] });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch user' });
  }
});

const adminOnly = require('../middleware/adminOnly');

// POST /api/users — admin only, creates a new agent or admin user
router.post('/users', adminOnly, async (req, res) => {
  const { email, name, password, role } = req.body;
  if (!email?.trim() || !name?.trim() || !password) {
    return res.status(400).json({ error: 'email, name, and password are required' });
  }
  const validRoles = ['agent', 'admin'];
  const assignedRole = validRoles.includes(role) ? role : 'agent';

  try {
    // Fetch the current policy before hashing. We do this inside the try block
    // so a DB error here gets caught and returns a 500 rather than an unhandled
    // rejection. We fall back to 10 (the hard floor) if the row is somehow missing.
    const { rows: settingRows } = await pool.query(
      `SELECT value FROM settings WHERE key = 'min_password_length'`
    );
    const minLength = settingRows.length ? parseInt(settingRows[0].value, 10) : 10;

    // Server-side enforcement — the UI also validates, but this is the real gate.
    // An attacker sending a raw POST skips the UI entirely, so we must check here.
    if (password.length < minLength) {
      return res.status(400).json({
        error: `Password must be at least ${minLength} characters`,
      });
    }

    const hash = await bcrypt.hash(password, 10);
    const { rows } = await pool.query(
      `INSERT INTO users (email, name, password_hash, role)
       VALUES ($1, $2, $3, $4)
       RETURNING id, email, name, role`,
      [email.trim().toLowerCase(), name.trim(), hash, assignedRole]
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    if (err.code === '23505') {
      return res.status(409).json({ error: 'Email already in use' });
    }
    console.error(err);
    res.status(500).json({ error: 'Failed to create user' });
  }
});

module.exports = router;
