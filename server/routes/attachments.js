'use strict';

const express   = require('express');
const multer    = require('multer');
const { v4: uuidv4 } = require('uuid');
const path      = require('path');
const db        = require('../db');
const requireAuth = require('../middleware/requireAuth');
const adminOnly   = require('../middleware/adminOnly');
const { uploadFile, streamFile, deleteFile } = require('../lib/seaweedStorage');

const router = express.Router({ mergeParams: true });

// Store uploads in memory — SeaweedFS receives the buffer directly.
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 }, // 20 MB per file
  fileFilter: (_req, file, cb) => {
    const ALLOWED = [
      'image/jpeg', 'image/png', 'image/gif', 'image/webp',
      'application/pdf',
      'text/plain', 'text/csv',
      'application/zip',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    ];
    if (ALLOWED.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error(`File type not allowed: ${file.mimetype}`));
    }
  },
});

// ── POST /api/tickets/:ticketId/attachments ───────────────────
// Upload a file attached to a ticket.
router.post('/', requireAuth, upload.single('file'), async (req, res) => {
  try {
    const { ticketId } = req.params;
    const file = req.file;
    if (!file) return res.status(400).json({ error: 'No file uploaded' });

    const { rows: ticketRows } = await db.query(
      'SELECT id FROM tickets WHERE ticket_ref = $1', [ticketId]
    );
    if (!ticketRows.length) return res.status(404).json({ error: 'Ticket not found' });
    const numericId = ticketRows[0].id;

    // Fetch uploader name/email for the activity event snapshot.
    const { rows: userRows } = await db.query(
      'SELECT name, email FROM users WHERE id = $1', [req.session.userId]
    );
    const uploader = userRows[0] ?? {};

    const ext         = path.extname(file.originalname).toLowerCase();
    const key         = `attachments/${ticketId}/${uuidv4()}${ext}`;
    const publicToken = uuidv4();

    await uploadFile(file.buffer, key, file.mimetype);

    const { rows } = await db.query(
      `INSERT INTO ticket_attachments
         (ticket_id, uploader_id, filename, storage_key, mime_type, size_bytes, public_token)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING *`,
      [numericId, req.session.userId, file.originalname, key, file.mimetype, file.size, publicToken]
    );

    // Log to ticket_events so the upload appears in All Activity.
    await db.query(
      `INSERT INTO ticket_events (ticket_id, actor_id, actor_name, actor_email, event_type, to_value)
       VALUES ($1, $2, $3, $4, 'attachment_added', $5)`,
      [numericId, req.session.userId, uploader.name ?? null, uploader.email ?? null, file.originalname]
    );

    res.status(201).json(rows[0]);
  } catch (err) {
    console.error('[attachments] upload error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/tickets/:ticketId/attachments ────────────────────
// List all attachments for a ticket.
router.get('/', requireAuth, async (req, res) => {
  try {
    const { rows: ticketRows } = await db.query(
      'SELECT id FROM tickets WHERE ticket_ref = $1', [req.params.ticketId]
    );
    if (!ticketRows.length) return res.status(404).json({ error: 'Ticket not found' });

    const { rows } = await db.query(
      `SELECT a.*, u.name AS uploader_name
       FROM ticket_attachments a
       LEFT JOIN users u ON u.id = a.uploader_id
       WHERE a.ticket_id = $1
       ORDER BY a.created_at DESC`,
      [ticketRows[0].id]
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/tickets/:ticketId/attachments/:id/download ───────
// Proxy the file from SeaweedFS to the browser.
router.get('/:id/download', requireAuth, async (req, res) => {
  try {
    const { rows: ticketRows } = await db.query(
      'SELECT id FROM tickets WHERE ticket_ref = $1', [req.params.ticketId]
    );
    if (!ticketRows.length) return res.status(404).json({ error: 'Ticket not found' });

    const { rows } = await db.query(
      'SELECT * FROM ticket_attachments WHERE id = $1 AND ticket_id = $2',
      [req.params.id, ticketRows[0].id]
    );
    if (!rows.length) return res.status(404).json({ error: 'Attachment not found' });

    const att = rows[0];
    res.setHeader('Content-Type', att.mime_type);
    res.setHeader('Content-Disposition', `inline; filename="${att.filename}"`);
    await streamFile(att.storage_key, res);
  } catch (err) {
    console.error('[attachments] download error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ── DELETE /api/tickets/:ticketId/attachments/:id ─────────────
// Delete an attachment. Agents can delete their own; admins can delete any.
router.delete('/:id', requireAuth, async (req, res) => {
  try {
    const { rows: ticketRows } = await db.query(
      'SELECT id FROM tickets WHERE ticket_ref = $1', [req.params.ticketId]
    );
    if (!ticketRows.length) return res.status(404).json({ error: 'Ticket not found' });

    const { rows } = await db.query(
      'SELECT * FROM ticket_attachments WHERE id = $1 AND ticket_id = $2',
      [req.params.id, ticketRows[0].id]
    );
    if (!rows.length) return res.status(404).json({ error: 'Attachment not found' });

    const att      = rows[0];
    const isOwner  = att.uploader_id === req.session.userId;
    const isAdmin  = req.session.userRole === 'admin';

    // Re-check role from DB for freshness (same pattern as adminOnly middleware)
    const { rows: userRows } = await db.query(
      'SELECT role FROM users WHERE id = $1', [req.session.userId]
    );
    const role = userRows[0]?.role;

    if (!isOwner && role !== 'admin') {
      return res.status(403).json({ error: 'Forbidden' });
    }

    await deleteFile(att.storage_key);
    await db.query('DELETE FROM ticket_attachments WHERE id = $1', [att.id]);

    res.json({ ok: true });
  } catch (err) {
    console.error('[attachments] delete error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
