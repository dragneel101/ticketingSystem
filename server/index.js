require('dotenv').config();
const express = require('express');
const path = require('path');
const session = require('express-session');
const connectPg = require('connect-pg-simple');

const pool = require('./db');
const requireAuth = require('./middleware/requireAuth');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());

// Trust the first proxy (Traefik on Coolify) so secure cookies work over HTTPS
app.set('trust proxy', 1);

// ── Sessions ─────────────────────────────────────────────────
// connect-pg-simple needs the pg Pool directly (not via a require wrapper),
// so we pass pool in when constructing the store.
const PgSession = connectPg(session);

app.use(
  session({
    store: new PgSession({
      pool,                        // reuse the existing connection pool
      tableName: 'sessions',       // table name in Postgres
      createTableIfMissing: true,  // auto-create the sessions table on first run
    }),
    secret: process.env.SESSION_SECRET || 'dev-secret-change-in-production',
    resave: false,           // don't write session back if nothing changed
    saveUninitialized: false, // don't create a cookie until user logs in
    cookie: {
      httpOnly: true,   // JS can't read this cookie — XSS protection
      secure: process.env.NODE_ENV === 'production', // HTTPS-only in prod
      maxAge: 7 * 24 * 60 * 60 * 1000, // 1 week in milliseconds
      sameSite: 'lax',  // sent on same-site navigations, blocks cross-site POST CSRF
    },
  })
);

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

// ── Auth routes (public — no requireAuth) ────────────────────
const authRouter = require('./routes/auth');
app.use('/api/auth', authRouter);

// ── Settings routes (admin only) ─────────────────────────────
// adminOnly is applied per-route inside the router, but we still apply
// requireAuth here so unauthenticated requests get a 401 (not a 403)
// before we even reach the adminOnly check.
const settingsRouter = require('./routes/settings');
app.use('/api/settings', requireAuth, settingsRouter);

// ── Ticket routes (protected) ────────────────────────────────
// requireAuth runs before any ticket route handler.
// If the session is missing, it short-circuits with 401.
const ticketsRouter = require('./routes/tickets');
app.use('/api/tickets', requireAuth, ticketsRouter);

// ── SPA catch-all — must be last ─────────────────────────────
// Any non-API request gets index.html so client-side routing works.
app.get('*', (req, res) => {
  res.sendFile(path.join(distPath, 'index.html'));
});

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
