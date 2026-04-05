# SupportDesk

A full-stack customer support ticketing system built with React, Express, and PostgreSQL.

## Features

### Ticket Management
- Create tickets with subject, category, priority, customer info, phone, and company
- Status workflow: `unassigned → assigned → in-progress → pending-client → pending-vendor → scheduled → requesting-escalation → resolved → closed`
- Deferred saves — status, priority, board, and assignee changes are buffered locally and committed with a single Save button
- Full audit trail — every field change is logged with actor name and timestamp
- Delete tickets (admin only) with inline two-step confirmation

### Communication
- Customer-facing message thread per ticket
- Internal notes (agent-only, amber-tinted — never shown to customers)
- Optional per-reply email toggle to suppress customer notifications
- All Activity tab — unified chronological feed of messages, notes, and audit events with filter chips

### SLA Policies
- Define first-response and resolution deadlines per priority (low / medium / high / urgent)
- Deadlines computed on ticket creation; recalculated when priority changes
- Live countdown chip on every ticket card and detail page (green / amber / red)
- Background notifier emails the assignee (or support inbox) 60 minutes before resolution deadline
- SLA check interval configurable from the Settings page

### Email Notifications
- **Ticket created** — notifies the assignee (or support inbox) with ticket details and SLA deadline
- **Ticket reassigned** — notifies the new assignee, including who made the assignment
- **Status changed** — notifies the customer
- **New reply** — notifies the customer (suppressible per-message)
- **SLA warning** — notifies assignee or support inbox 60 min before resolution deadline
- SMTP configured via the admin Settings page (no restart required); test-email endpoint included
- Password masked in all API responses (`smtp_pass_set` boolean only)

### Boards
- Organise tickets into custom boards (e.g. by team or product area)
- Admin create / rename / delete boards; linked tickets become unboarded on delete

### Companies & Customers
- First-class company records with address, primary contact, and phone
- Per-company SLA policy override (falls back to default policy when unset)
- Customer records auto-populated from ticket data; searchable with ticket count
- Company detail page shows linked customers and open tickets

### Dashboard
- Stat cards: total / open / pending / resolved / unassigned / mine / SLA breach / breaching soon
- CSS-only priority bar chart
- Recent activity table (last 8 tickets) with direct View links
- Quick-action buttons for admins

### User Management (admin only)
- Create agent and admin accounts with enforced minimum password length
- Edit name, email, and role; reset any user's password
- Delete accounts (self-delete blocked)

### Auth & Security
- Session-based auth (express-session + connect-pg-simple, rolling 1-week sessions)
- bcrypt password hashing
- `requireAuth` and `adminOnly` middleware on all protected routes
- Configurable minimum password length (floor: 10)

### UX
- Navigation state persisted in `sessionStorage` — refreshing the page restores the same view and ticket
- Loading skeletons on ticket list and ticket detail
- Empty states with SVG illustrations and contextual CTAs
- Toast notifications (success / error / info, auto-dismiss 3.5 s)
- Mobile-responsive with hamburger nav drawer below 680 px

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React 19, Vite 8, CSS custom properties (no UI library) |
| Backend | Node.js, Express (CommonJS) |
| Database | PostgreSQL |
| Auth | express-session, connect-pg-simple, bcrypt |
| Email | nodemailer |
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
PORT=3000              # optional, defaults to 3000
DATABASE_SSL=true      # optional, set for hosted/cloud DBs

# Optional SMTP fallback — can also be configured via the admin Settings UI
SMTP_HOST=smtp.example.com
SMTP_PORT=587
SMTP_USER=user@example.com
SMTP_PASS=yourpassword
SMTP_FROM=noreply@example.com
SUPPORT_EMAIL=support@example.com
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
│   ├── context/            # TicketContext, AuthContext, ToastContext, BoardContext, SlaContext
│   ├── utils/              # statusConfig and other shared helpers
│   ├── App.jsx             # Root shell, view routing (no router library)
│   └── index.css           # Full design system — CSS custom properties only
├── server/
│   ├── routes/             # tickets.js, auth.js, companies.js, customers.js, boards.js, sla.js, settings.js
│   ├── middleware/         # requireAuth.js, adminOnly.js
│   ├── lib/                # emailService.js, slaNotifier.js, slaUtils.js
│   ├── tests/              # Jest + Supertest integration tests
│   ├── schema.sql          # All tables, indexes, seed data, and migrations
│   ├── db.js               # pg.Pool configured via DATABASE_URL
│   ├── app.js              # Express app (exported for Supertest)
│   └── index.js            # Entry point — binds port, loads SMTP config, starts SLA notifier
├── public/
│   └── favicon.svg
└── nixpacks.toml           # Coolify / nixpacks deployment config
```

## Navigation

The app uses a `VIEWS` enum in `App.jsx` instead of a URL router. Active view is persisted in `sessionStorage` so refreshing the page restores the same location.

| View | Access |
|---|---|
| Dashboard | all |
| Tickets (list + detail) | all |
| Customers | all |
| Companies + Company Detail | all |
| Users | admin only |
| Settings | admin only |

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

Change this immediately after first login via **Settings → Password Policy**, and configure SMTP via **Settings → Email**.
