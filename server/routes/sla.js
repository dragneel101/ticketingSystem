'use strict';
const express  = require('express');
const router   = express.Router();
const pool     = require('../db');
const adminOnly = require('../middleware/adminOnly');

// ── GET /api/sla-policies ─────────────────────────────────────
// All authenticated users can read policies (agents need them to display
// SLA information on tickets). requireAuth is applied in app.js.
router.get('/', async (req, res) => {
  try {
    const { rows } = await pool.query(
      'SELECT * FROM sla_policies ORDER BY is_default DESC, name ASC'
    );
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch SLA policies' });
  }
});

// ── POST /api/sla-policies ────────────────────────────────────
router.post('/', adminOnly, async (req, res) => {
  const {
    name,
    response_low_minutes, response_medium_minutes,
    response_high_minutes, response_urgent_minutes,
    resolution_low_minutes, resolution_medium_minutes,
    resolution_high_minutes, resolution_urgent_minutes,
    is_default,
  } = req.body;

  if (!name?.trim()) {
    return res.status(400).json({ error: 'name is required' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // If this policy is being set as default, clear the flag on all others first.
    if (is_default) {
      await client.query('UPDATE sla_policies SET is_default = FALSE');
    }

    const { rows } = await client.query(
      `INSERT INTO sla_policies (
        name,
        response_low_minutes, response_medium_minutes,
        response_high_minutes, response_urgent_minutes,
        resolution_low_minutes, resolution_medium_minutes,
        resolution_high_minutes, resolution_urgent_minutes,
        is_default
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
      RETURNING *`,
      [
        name.trim(),
        toMinutes(response_low_minutes),
        toMinutes(response_medium_minutes),
        toMinutes(response_high_minutes),
        toMinutes(response_urgent_minutes),
        toMinutes(resolution_low_minutes),
        toMinutes(resolution_medium_minutes),
        toMinutes(resolution_high_minutes),
        toMinutes(resolution_urgent_minutes),
        Boolean(is_default),
      ]
    );

    await client.query('COMMIT');
    res.status(201).json(rows[0]);
  } catch (err) {
    await client.query('ROLLBACK');
    if (err.code === '23505') {
      return res.status(409).json({ error: 'An SLA policy with that name already exists' });
    }
    console.error(err);
    res.status(500).json({ error: 'Failed to create SLA policy' });
  } finally {
    client.release();
  }
});

// ── PATCH /api/sla-policies/:id ───────────────────────────────
router.patch('/:id', adminOnly, async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) return res.status(400).json({ error: 'Invalid policy id' });

  const {
    name,
    response_low_minutes, response_medium_minutes,
    response_high_minutes, response_urgent_minutes,
    resolution_low_minutes, resolution_medium_minutes,
    resolution_high_minutes, resolution_urgent_minutes,
    is_default,
  } = req.body;

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const { rows: existing } = await client.query(
      'SELECT * FROM sla_policies WHERE id = $1 FOR UPDATE',
      [id]
    );
    if (existing.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'SLA policy not found' });
    }

    const cur = existing[0];
    const updated = {
      name:                       name?.trim()                     ?? cur.name,
      response_low_minutes:       toMinutes(response_low_minutes,  cur.response_low_minutes),
      response_medium_minutes:    toMinutes(response_medium_minutes, cur.response_medium_minutes),
      response_high_minutes:      toMinutes(response_high_minutes,  cur.response_high_minutes),
      response_urgent_minutes:    toMinutes(response_urgent_minutes, cur.response_urgent_minutes),
      resolution_low_minutes:     toMinutes(resolution_low_minutes,  cur.resolution_low_minutes),
      resolution_medium_minutes:  toMinutes(resolution_medium_minutes, cur.resolution_medium_minutes),
      resolution_high_minutes:    toMinutes(resolution_high_minutes,  cur.resolution_high_minutes),
      resolution_urgent_minutes:  toMinutes(resolution_urgent_minutes, cur.resolution_urgent_minutes),
      is_default:                 is_default !== undefined ? Boolean(is_default) : cur.is_default,
    };

    // If this policy is being promoted to default, clear the flag elsewhere.
    if (updated.is_default && !cur.is_default) {
      await client.query('UPDATE sla_policies SET is_default = FALSE WHERE id != $1', [id]);
    }

    const { rows } = await client.query(
      `UPDATE sla_policies SET
        name = $1,
        response_low_minutes = $2, response_medium_minutes = $3,
        response_high_minutes = $4, response_urgent_minutes = $5,
        resolution_low_minutes = $6, resolution_medium_minutes = $7,
        resolution_high_minutes = $8, resolution_urgent_minutes = $9,
        is_default = $10
       WHERE id = $11
       RETURNING *`,
      [
        updated.name,
        updated.response_low_minutes, updated.response_medium_minutes,
        updated.response_high_minutes, updated.response_urgent_minutes,
        updated.resolution_low_minutes, updated.resolution_medium_minutes,
        updated.resolution_high_minutes, updated.resolution_urgent_minutes,
        updated.is_default,
        id,
      ]
    );

    await client.query('COMMIT');
    res.json(rows[0]);
  } catch (err) {
    await client.query('ROLLBACK');
    if (err.code === '23505') {
      return res.status(409).json({ error: 'An SLA policy with that name already exists' });
    }
    console.error(err);
    res.status(500).json({ error: 'Failed to update SLA policy' });
  } finally {
    client.release();
  }
});

// ── DELETE /api/sla-policies/:id ──────────────────────────────
router.delete('/:id', adminOnly, async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) return res.status(400).json({ error: 'Invalid policy id' });

  try {
    const { rows } = await pool.query('SELECT * FROM sla_policies WHERE id = $1', [id]);
    if (rows.length === 0) return res.status(404).json({ error: 'SLA policy not found' });
    if (rows[0].is_default) {
      return res.status(409).json({ error: 'Cannot delete the default SLA policy' });
    }

    // Block deletion if any companies still reference this policy.
    const { rows: linked } = await pool.query(
      'SELECT COUNT(*) FROM companies WHERE sla_policy_id = $1', [id]
    );
    if (parseInt(linked[0].count, 10) > 0) {
      return res.status(409).json({
        error: `${linked[0].count} company/companies use this policy — reassign them first`,
      });
    }

    await pool.query('DELETE FROM sla_policies WHERE id = $1', [id]);
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to delete SLA policy' });
  }
});

// ── PATCH /api/sla-policies/:id/set-default ───────────────────
router.patch('/:id/set-default', adminOnly, async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) return res.status(400).json({ error: 'Invalid policy id' });

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('UPDATE sla_policies SET is_default = FALSE');
    const { rows } = await client.query(
      'UPDATE sla_policies SET is_default = TRUE WHERE id = $1 RETURNING *',
      [id]
    );
    if (rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'SLA policy not found' });
    }
    await client.query('COMMIT');
    res.json(rows[0]);
  } catch (err) {
    await client.query('ROLLBACK');
    console.error(err);
    res.status(500).json({ error: 'Failed to set default SLA policy' });
  } finally {
    client.release();
  }
});

// ── helpers ───────────────────────────────────────────────────
// Convert a value to a positive integer minute count or null.
// If the value is explicitly null/undefined and a fallback is provided,
// use the fallback (for PATCH where omitted fields keep their current value).
function toMinutes(val, fallback = null) {
  if (val === null || val === undefined) return fallback;
  const n = parseInt(val, 10);
  return isNaN(n) || n < 1 ? null : n;
}

module.exports = router;
