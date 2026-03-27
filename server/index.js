require('dotenv').config();
const express = require('express');
const path = require('path');
const pool = require('./db');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());

// ── Static frontend (production) ─────────────────────────────
// In dev, Vite serves the frontend and proxies /api to this server.
// In production, Express serves the built frontend directly.
const distPath = path.join(__dirname, '../dist');
app.use(express.static(distPath));

// ── Health check ────────────────────────────────────────────
app.get('/api/healthz', async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT NOW() AS time');
    res.json({ status: 'ok', db_time: rows[0].time });
  } catch (err) {
    console.error(err);
    res.status(500).json({ status: 'error', message: err.message });
  }
});

// ── Routes ───────────────────────────────────────────────────
const ticketsRouter = require('./routes/tickets');
app.use('/api/tickets', ticketsRouter);

// ── SPA catch-all — must be last ─────────────────────────────
// Any non-API request gets index.html so client-side routing works.
app.get('*', (req, res) => {
  res.sendFile(path.join(distPath, 'index.html'));
});

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
