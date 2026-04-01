const express = require('express');
const router = express.Router();
const pool = require('../db');
const adminOnly = require('../middleware/adminOnly');

// ── GET /api/boards ───────────────────────────────────────────
// List all boards with ticket count. Accessible to all authenticated users.
router.get('/', async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT b.*, COUNT(t.id)::int AS ticket_count
       FROM boards b
       LEFT JOIN tickets t ON t.board_id = b.id
       GROUP BY b.id
       ORDER BY b.name ASC`
    );
    res.json({ boards: rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch boards' });
  }
});

// ── POST /api/boards ──────────────────────────────────────────
// Admin only. Body: { name }
router.post('/', adminOnly, async (req, res) => {
  const { name } = req.body;
  if (!name?.trim()) return res.status(400).json({ error: 'name is required' });

  try {
    const { rows } = await pool.query(
      'INSERT INTO boards (name) VALUES ($1) RETURNING *',
      [name.trim()]
    );
    res.status(201).json({ ...rows[0], ticket_count: 0 });
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: 'A board with that name already exists' });
    console.error(err);
    res.status(500).json({ error: 'Failed to create board' });
  }
});

// ── PATCH /api/boards/:id ─────────────────────────────────────
// Admin only. Body: { name }
router.patch('/:id', adminOnly, async (req, res) => {
  const { name } = req.body;
  if (!name?.trim()) return res.status(400).json({ error: 'name is required' });

  try {
    const { rows, rowCount } = await pool.query(
      'UPDATE boards SET name = $1 WHERE id = $2 RETURNING *',
      [name.trim(), req.params.id]
    );
    if (rowCount === 0) return res.status(404).json({ error: 'Board not found' });
    res.json(rows[0]);
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: 'A board with that name already exists' });
    console.error(err);
    res.status(500).json({ error: 'Failed to update board' });
  }
});

// ── DELETE /api/boards/:id ────────────────────────────────────
// Admin only. Linked tickets get board_id = NULL (ON DELETE SET NULL).
router.delete('/:id', adminOnly, async (req, res) => {
  try {
    const { rowCount } = await pool.query('DELETE FROM boards WHERE id = $1', [req.params.id]);
    if (rowCount === 0) return res.status(404).json({ error: 'Board not found' });
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to delete board' });
  }
});

module.exports = router;
