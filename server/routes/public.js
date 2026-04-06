'use strict';

const express = require('express');
const db      = require('../db');
const { streamFile } = require('../lib/seaweedStorage');

const router = express.Router();

// ── GET /api/public/attachments/:token ───────────────────────
// Public (no-auth) download endpoint for email links.
// Each attachment has a unique random token generated at upload time.
// inline disposition for images so email clients/browsers render them directly.
router.get('/attachments/:token', async (req, res) => {
  try {
    const { rows } = await db.query(
      'SELECT * FROM ticket_attachments WHERE public_token = $1',
      [req.params.token]
    );
    if (!rows.length) return res.status(404).send('Attachment not found');

    const att = rows[0];
    const isImage = att.mime_type?.startsWith('image/');

    res.setHeader('Content-Type', att.mime_type || 'application/octet-stream');
    // inline → browser renders images and PDFs directly; attachment → download prompt
    res.setHeader(
      'Content-Disposition',
      `${isImage ? 'inline' : 'attachment'}; filename="${att.filename}"`
    );
    await streamFile(att.storage_key, res);
  } catch (err) {
    console.error('[public] download error:', err.message);
    if (!res.headersSent) res.status(500).send('Download failed');
  }
});

module.exports = router;
