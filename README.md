# SupportDesk

A full-stack customer support ticketing system built with React, Express, and PostgreSQL.

## Features

- **Ticket management** — create, assign, update status/priority, and resolve tickets with full audit trail
- **Customer records** — manage customer contacts with auto-population when creating tickets
- **Internal notes** — agents can leave private notes separate from customer-facing messages
- **Audit history** — every status, priority, assignee, and resolution change is logged with actor and timestamp
- **User management** — admin-only interface to create/edit/delete agent and admin accounts
- **Session-based auth** — secure login with bcrypt password hashing and rolling sessions
- **Dashboard** — live stats (open, pending, resolved, unassigned, mine), priority breakdown, recent activity

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React 19, Vite 8, CSS custom properties (no UI library) |
| Backend | Node.js, Express (CommonJS) |
| Database | PostgreSQL |
| Auth | express-session, connect-pg-simple, bcrypt |
| Tests | Jest + Supertest (backend), Vitest + React Testing Library (frontend) |

## Getting Started

### Prerequisites

- Node.js `^20.19.0` or `>=22.12.0`
- PostgreSQL database

### Installation

```bash
# Install frontend dependencies
npm install

# Install backend dependencies
cd server && npm install && cd ..
```

### Environment Variables

Create a `.env` file in `server/` (or set these in your environment):

```env
DATABASE_URL=postgres://user:password@localhost:5432/supportdesk
SESSION_SECRET=your-secret-here
PORT=3000                # optional, defaults to 3000
DATABASE_SSL=true        # optional, set for hosted DBs
```

### Database Setup

Run the schema against your PostgreSQL database:

```bash
psql $DATABASE_URL -f server/schema.sql
```

This is idempotent — safe to re-run. It creates all tables, indexes, seed data, and migrations.

### Running Locally

```bash
# Terminal 1 — backend API (port 3000)
cd server && node index.js

# Terminal 2 — frontend dev server with HMR (port 5173)
npm run dev
```

Vite proxies `/api` requests to `localhost:3000` automatically.

### Other Commands

```bash
npm run build      # production build → dist/
npm run preview    # serve the production build locally
npm run lint       # ESLint

# Run backend tests (requires a live PostgreSQL connection via DATABASE_URL)
cd server && npm test

# Run frontend tests
npm test
```

## Project Structure

```
├── src/
│   ├── components/         # React page and UI components
│   ├── context/            # TicketContext, AuthContext, ToastContext
│   ├── App.jsx             # Root shell, view routing (no router library)
│   └── index.css           # Full design system — CSS custom properties only
├── server/
│   ├── routes/             # tickets.js, auth.js, customers.js, settings.js
│   ├── middleware/         # requireAuth.js, adminOnly.js
│   ├── tests/              # Jest + Supertest integration tests
│   ├── schema.sql          # All tables, indexes, seed data, and migrations
│   ├── db.js               # pg.Pool configured via DATABASE_URL
│   └── app.js              # Express app (exported for Supertest)
├── public/
│   └── favicon.svg
└── nixpacks.toml           # Coolify / nixpacks deployment config
```

## Navigation

The app uses a `VIEWS` enum in `App.jsx` instead of a URL router:

| View | Path | Access |
|---|---|---|
| Dashboard | default | all |
| Tickets | ticket list + detail | all |
| Customers | customer records | all |
| Users | user management | admin only |
| Settings | password policy | admin only |

## Deployment

Hosted on [Coolify](https://coolify.io) via nixpacks. The `nixpacks.toml` pins Node 22 and defines install, build, and start phases.

Required env vars in production: `DATABASE_URL`, `SESSION_SECRET`.
Optional: `PORT` (default 3000), `DATABASE_SSL=true` for SSL connections.

The production build serves both static files and the API from a single Express process.

## Default Credentials

After running `schema.sql`, a seed admin account is created:

| Field | Value |
|---|---|
| Email | `admin@example.com` |
| Password | `password123` |

Change this immediately after first login via the Settings page.
