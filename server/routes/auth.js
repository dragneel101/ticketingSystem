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

const requireAuth = require('../middleware/requireAuth');
const adminOnly = require('../middleware/adminOnly');

// GET /api/auth/agents — any authenticated user, returns agents + admins only.
// Used by the ticket assignment dropdown: agents need this list to assign tickets
// but should not have full admin access to all user management data.
// We expose less than GET /api/auth/users: no created_at, only id/name/email/role.
router.get('/agents', requireAuth, async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT id, name, email, role
       FROM users
       WHERE role IN ('agent', 'admin')
       ORDER BY name ASC`
    );
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch agents' });
  }
});

// GET /api/auth/users — admin only, lists all users (never exposes password_hash)
// Ordered newest-first so freshly created users surface at the top of the table.
router.get('/users', adminOnly, async (req, res) => {
  try {
    const { rows } = await pool.query(
      'SELECT id, email, name, role, created_at FROM users ORDER BY created_at DESC'
    );
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch users' });
  }
});

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

// ── DELETE /api/auth/users/:id ────────────────────────────────
// Admin only. Hard-prevents self-deletion on the server.
// Why here and not just the frontend? Because any admin with a valid session
// cookie can hit this endpoint directly — the UI is advisory, the server is law.
router.delete('/users/:id', adminOnly, async (req, res) => {
  const targetId = parseInt(req.params.id, 10);

  // parseInt returns NaN for non-numeric strings — guard early.
  if (isNaN(targetId)) {
    return res.status(400).json({ error: 'Invalid user id' });
  }

  // Self-deletion check: compare string form of both ids to avoid type mismatch
  // (req.session.userId is stored as a number but params come in as strings).
  if (targetId === req.session.userId) {
    return res.status(400).json({ error: 'Cannot delete your own account' });
  }

  try {
    const { rowCount } = await pool.query(
      'DELETE FROM users WHERE id = $1',
      [targetId]
    );

    // rowCount === 0 means the row didn't exist — surface a clean 404 rather
    // than silently returning 204, so the frontend can distinguish "gone" from
    // "already deleted".
    if (rowCount === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    // 204 No Content is the REST convention for a successful delete with no body.
    res.status(204).end();
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to delete user' });
  }
});

// ── PATCH /api/auth/users/:id ─────────────────────────────────
// Admin only. Accepts { name, email, role } — all optional.
// Prevents an admin from changing their own role (self-lockout protection).
router.patch('/users/:id', adminOnly, async (req, res) => {
  const targetId = parseInt(req.params.id, 10);
  if (isNaN(targetId)) {
    return res.status(400).json({ error: 'Invalid user id' });
  }

  const { name, email, role } = req.body;

  // Self-role-change guard: changing your own role to 'agent' would strip your
  // admin access immediately — the next adminOnly request would 403. Prevent it.
  if (role !== undefined && targetId === req.session.userId) {
    return res.status(400).json({ error: 'Cannot change your own role' });
  }

  // Validate inputs only when they're present — all fields are optional.
  if (email !== undefined) {
    // Simple but effective email check: must contain @ with chars on both sides.
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      return res.status(400).json({ error: 'Invalid email address' });
    }
  }

  if (role !== undefined && !['admin', 'agent'].includes(role)) {
    return res.status(400).json({ error: 'Role must be admin or agent' });
  }

  // Build the SET clause dynamically so we only update provided fields.
  // We accumulate column assignments and their values in parallel arrays,
  // then join them into the SQL string. This avoids overwriting fields that
  // weren't sent in the request body.
  const setClauses = [];
  const values = [];
  let idx = 1;

  if (name !== undefined) {
    setClauses.push(`name = $${idx++}`);
    values.push(name.trim());
  }
  if (email !== undefined) {
    setClauses.push(`email = $${idx++}`);
    values.push(email.trim().toLowerCase());
  }
  if (role !== undefined) {
    setClauses.push(`role = $${idx++}`);
    values.push(role);
  }

  if (setClauses.length === 0) {
    return res.status(400).json({ error: 'No fields provided to update' });
  }

  // The WHERE clause placeholder index comes after all SET values.
  values.push(targetId);

  try {
    const { rows } = await pool.query(
      `UPDATE users SET ${setClauses.join(', ')} WHERE id = $${idx}
       RETURNING id, email, name, role`,
      values
    );

    if (rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json(rows[0]);
  } catch (err) {
    // Postgres unique constraint violation on the email column
    if (err.code === '23505') {
      return res.status(409).json({ error: 'Email already in use' });
    }
    console.error(err);
    res.status(500).json({ error: 'Failed to update user' });
  }
});

// ── POST /api/auth/users/:id/reset-password ───────────────────
// Admin only. Accepts { password }. Enforces the same min_password_length
// policy as user creation — the admin can't set a password weaker than the
// current policy even when resetting.
router.post('/users/:id/reset-password', adminOnly, async (req, res) => {
  const targetId = parseInt(req.params.id, 10);
  if (isNaN(targetId)) {
    return res.status(400).json({ error: 'Invalid user id' });
  }

  const { password } = req.body;
  if (!password) {
    return res.status(400).json({ error: 'password is required' });
  }

  try {
    // Fetch the live policy — same pattern as POST /api/auth/users.
    // Falling back to 10 keeps the route functional even if settings are missing.
    const { rows: settingRows } = await pool.query(
      `SELECT value FROM settings WHERE key = 'min_password_length'`
    );
    const minLength = settingRows.length ? parseInt(settingRows[0].value, 10) : 10;

    if (password.length < minLength) {
      return res.status(400).json({
        error: `Password must be at least ${minLength} characters`,
      });
    }

    const hash = await bcrypt.hash(password, 10);

    const { rowCount } = await pool.query(
      'UPDATE users SET password_hash = $1 WHERE id = $2',
      [hash, targetId]
    );

    if (rowCount === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json({ message: 'Password updated' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to reset password' });
  }
});

module.exports = router;
