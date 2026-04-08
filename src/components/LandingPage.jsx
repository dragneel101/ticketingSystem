import { useEffect, useRef, useState } from 'react';
import '../landing.css';

// SVG icon helpers — all Heroicons / Lucide style (24×24 viewBox)
function Icon({ children, ...props }) {
  return (
    <svg
      width="22" height="22" viewBox="0 0 24 24"
      fill="none" stroke="currentColor" strokeWidth="2"
      strokeLinecap="round" strokeLinejoin="round"
      aria-hidden="true"
      {...props}
    >
      {children}
    </svg>
  );
}

function StarIcon() {
  return (
    <svg className="lp-star" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01z" />
    </svg>
  );
}

function Stars() {
  return (
    <div className="lp-stars" aria-label="5 stars">
      <StarIcon /><StarIcon /><StarIcon /><StarIcon /><StarIcon />
    </div>
  );
}

function CheckIcon() {
  return (
    <svg className="lp-check" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}

// ─── FAQ item with its own open/close state ───────────────────────
function FaqItem({ q, a }) {
  const [open, setOpen] = useState(false);
  return (
    <div className={`lp-faq-item${open ? ' lp-open' : ''}`}>
      <button className="lp-faq-q" aria-expanded={open} onClick={() => setOpen(v => !v)}>
        {q}
        <svg className="lp-faq-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
        </svg>
      </button>
      <div className="lp-faq-a">{a}</div>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────
export default function LandingPage({ onSignIn }) {
  const rootRef = useRef(null);

  // Smooth-scroll anchor links using the container as scroll root
  useEffect(() => {
    function handle(e) {
      const a = e.target.closest('a[href^="#"]');
      if (!a) return;
      const target = document.querySelector(a.getAttribute('href'));
      if (target) {
        e.preventDefault();
        target.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    }
    const el = rootRef.current;
    if (el) el.addEventListener('click', handle);
    return () => { if (el) el.removeEventListener('click', handle); };
  }, []);

  function scrollToTop() {
    rootRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
  }

  return (
    <div className="lp-root" ref={rootRef}>

      {/* ── NAV ────────────────────────────────────────────── */}
      <header>
        <nav className="lp-nav" role="navigation" aria-label="Main navigation">
          <div className="lp-nav-inner">
            <button className="lp-nav-logo" onClick={scrollToTop} aria-label="Back to top">
              <div className="lp-nav-logo-icon" aria-hidden="true">
                <Icon width="18" height="18" stroke="#fff" strokeWidth="2.5">
                  <rect x="2" y="7" width="20" height="14" rx="2" />
                  <path d="M16 3 8 3 6 7h12z" />
                  <line x1="12" y1="12" x2="12" y2="17" />
                  <line x1="9.5" y1="14.5" x2="14.5" y2="14.5" />
                </Icon>
              </div>
              SupportDesk
            </button>

            <ul className="lp-nav-links" role="list">
              <li><a href="#lp-features">Features</a></li>
              <li><a href="#lp-how">How it works</a></li>
              <li><a href="#lp-stack">Tech stack</a></li>
              <li><a href="#lp-faq">FAQ</a></li>
            </ul>

            <div className="lp-nav-actions">
              <button className="lp-btn lp-btn-ghost" style={{ padding: '9px 18px', fontSize: 14 }} onClick={onSignIn}>
                Sign in
              </button>
              <button className="lp-btn lp-btn-primary" style={{ padding: '9px 18px', fontSize: 14 }} onClick={onSignIn}>
                Try the demo
              </button>
            </div>
          </div>
        </nav>
      </header>

      <main>
        {/* ── HERO ──────────────────────────────────────────── */}
        <section className="lp-hero" aria-labelledby="lp-hero-h1">
          <div className="lp-container">
            <div className="lp-hero-badge lp-fade">
              <span className="lp-badge-dot" aria-hidden="true" />
              Personal full-stack project — built from scratch
            </div>

            <h1 id="lp-hero-h1" className="lp-fade lp-fade-1">
              A ticketing system<br /><span>built end-to-end</span>
            </h1>

            <p className="lp-hero-sub lp-fade lp-fade-2">
              SupportDesk is a full-stack support ticketing app — featuring SLA tracking, role-based auth, audit trails, real-time dashboards, and email notifications. Built with React, Node.js, and PostgreSQL.
            </p>

            <div className="lp-hero-actions lp-fade lp-fade-3">
              <button className="lp-btn lp-btn-cta" onClick={onSignIn}>
                <Icon width="18" height="18" stroke="currentColor" strokeWidth="2.5">
                  <path d="M5 12h14M12 5l7 7-7 7" />
                </Icon>
                Explore the app
              </button>
              <a href="#lp-how" className="lp-btn lp-btn-ghost">See how it works</a>
            </div>

            <p className="lp-hero-note lp-fade lp-fade-4">
              <strong>No account needed.</strong> Sign in with the demo credentials to explore.
            </p>

            {/* App mockup */}
            <div className="lp-visual lp-fade lp-fade-4" aria-hidden="true">
              <div className="lp-visual-inner">
                <div className="lp-chrome">
                  <div className="lp-chrome-dots">
                    <div className="lp-chrome-dot" /><div className="lp-chrome-dot" /><div className="lp-chrome-dot" />
                  </div>
                  <div className="lp-chrome-bar">
                    <Icon width="12" height="12"><circle cx="11" cy="11" r="8" /><path d="m21 21-4.35-4.35" /></Icon>
                    localhost:5173/tickets
                  </div>
                </div>
                <div className="lp-app-body">
                  <div className="lp-sidebar">
                    <div className="lp-sidebar-logo">
                      <div className="lp-sidebar-logo-dot" />
                      SupportDesk
                    </div>
                    {[
                      { label: 'All Tickets', active: true },
                      { label: 'Dashboard' },
                      { label: 'Customers' },
                      { label: 'Companies' },
                      { label: 'Settings' },
                    ].map(({ label, active }) => (
                      <div key={label} className={`lp-sidebar-item${active ? ' lp-active' : ''}`}>
                        <div className="lp-sidebar-dot" style={{ background: active ? '#a5a8f8' : '#9aa3b5' }} />
                        {label}
                      </div>
                    ))}
                  </div>
                  <div className="lp-app-main">
                    <div className="lp-app-hrow">
                      <span className="lp-app-title">All Tickets</span>
                      <div className="lp-new-btn">+ New Ticket</div>
                    </div>
                    <div className="lp-stats">
                      <div className="lp-stat lp-stat-brand"><strong>24</strong>Open</div>
                      <div className="lp-stat"><strong>8</strong>Pending</div>
                      <div className="lp-stat"><strong>3</strong>Urgent</div>
                      <div className="lp-stat"><strong>142</strong>This Month</div>
                    </div>
                    {[
                      { badge: 'lp-badge-open',    label: 'Open',     subj: 'Cannot login after password reset',        email: 'sarah@acme.co',      first: true },
                      { badge: 'lp-badge-pending', label: 'Pending',  subj: 'Billing charge appeared twice this month', email: 'marco@globex.io' },
                      { badge: 'lp-badge-open',    label: 'Open',     subj: 'Feature request: CSV export for reports',  email: 'jlee@initech.com' },
                      { badge: 'lp-badge-closed',  label: 'Resolved', subj: 'API rate limits during peak hours',        email: 'devops@umbrella.co' },
                    ].map(({ badge, label, subj, email, first }) => (
                      <div key={email} className={`lp-ticket-row${first ? ' lp-ticket-first' : ''}`}>
                        <span className={`lp-badge ${badge}`}>{label}</span>
                        <span className="lp-ticket-subj">{subj}</span>
                        <span className="lp-ticket-email">{email}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ── FEATURES ──────────────────────────────────────── */}
        <section id="lp-features" className="lp-section lp-section-white" aria-labelledby="lp-feat-h2">
          <div className="lp-container">
            <div className="lp-centered">
              <div className="lp-label">
                <Icon width="14" height="14" fill="currentColor" stroke="none">
                  <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01z" />
                </Icon>
                What's included
              </div>
              <h2 id="lp-feat-h2" className="lp-title">Every feature built from scratch</h2>
              <p className="lp-sub">No UI libraries. No shortcuts. Every component, route, and database query written by hand.</p>
            </div>
            <div className="lp-feat-grid" role="list">
              {[
                {
                  icon: <><rect x="2" y="7" width="20" height="14" rx="2" /><path d="M16 3 8 3 6 7h12z" /></>,
                  title: 'Unified Ticket Inbox',
                  desc: 'All tickets in one place. Search, filter by status, priority, assignee, or SLA urgency. Keyboard navigation, sort by deadline.',
                },
                {
                  icon: <><circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" /></>,
                  title: 'SLA Tracking',
                  desc: 'Set response and resolution deadlines per priority tier. Live countdown chips turn amber then red as deadlines approach.',
                },
                {
                  icon: <><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" /></>,
                  title: 'Role-Based Auth',
                  desc: 'Session-based authentication with bcrypt. Admin and agent roles with per-route guards on both frontend and backend.',
                },
                {
                  icon: <><polyline points="22 12 18 12 15 21 9 3 6 12 2 12" /></>,
                  title: 'Real-time Dashboard',
                  desc: 'Stat cards, SLA-breach alerts, and Recharts bar charts for status and priority distribution — all derived from live data.',
                },
                {
                  icon: <><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" /></>,
                  title: 'Communications & Notes',
                  desc: 'Reply to customers, add internal notes visible only to agents, and log resolutions — all in a tabbed thread view per ticket.',
                },
                {
                  icon: <><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" /></>,
                  title: 'Full Audit Trail',
                  desc: 'Every status change, reassignment, and priority update is logged with actor and timestamp — a complete history per ticket.',
                },
                {
                  icon: <><rect x="3" y="3" width="7" height="7" /><rect x="14" y="3" width="7" height="7" /><rect x="14" y="14" width="7" height="7" /><rect x="3" y="14" width="7" height="7" /></>,
                  title: 'Boards & Routing',
                  desc: 'Organise tickets into custom boards by product area or workflow stage. Filter the inbox to a single board in one click.',
                },
                {
                  icon: <><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" /><polyline points="22,6 12,13 2,6" /></>,
                  title: 'Email Notifications',
                  desc: 'SMTP-configurable emails on ticket creation, assignment, status changes, and approaching SLA deadlines. Test from the settings UI.',
                },
                {
                  icon: <><circle cx="12" cy="12" r="3" /><path d="M19.07 4.93a10 10 0 0 1 0 14.14M4.93 4.93a10 10 0 0 0 0 14.14" /></>,
                  title: 'Company & Customer CRM',
                  desc: 'Customer contacts with company associations, SLA policy overrides per company, and per-customer ticket histories.',
                },
              ].map(({ icon, title, desc }) => (
                <div key={title} className="lp-feat-card" role="listitem">
                  <div className="lp-feat-icon" aria-hidden="true">
                    <Icon>{icon}</Icon>
                  </div>
                  <h3>{title}</h3>
                  <p>{desc}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ── HOW IT WORKS ──────────────────────────────────── */}
        <section id="lp-how" className="lp-section" aria-labelledby="lp-how-h2">
          <div className="lp-container">
            <div className="lp-label">
              <Icon width="14" height="14">
                <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                <polyline points="16 17 21 12 16 7" />
                <line x1="21" y1="12" x2="9" y2="12" />
              </Icon>
              How it works
            </div>
            <h2 id="lp-how-h2" className="lp-title">From ticket open to resolved in minutes</h2>
            <div className="lp-how-grid">
              <div className="lp-steps" role="list">
                {[
                  { n: '1', title: 'Ticket arrives', body: 'Create a ticket manually or receive one via email. Priority, category, and SLA deadlines are set automatically based on company policy.' },
                  { n: '2', title: 'Assign to an agent', body: 'Route to any team member instantly. The assignee gets an email notification and the ticket appears in their queue with SLA countdown.' },
                  { n: '3', title: 'Collaborate and resolve', body: 'Reply to the customer, leave internal notes, escalate if needed. Every action is timestamped and logged in the full audit trail.' },
                  { n: '4', title: 'Track with the dashboard', body: 'Dashboard metrics show SLA performance, status distribution, and per-agent workload — all derived live from the database.' },
                ].map(({ n, title, body }) => (
                  <div key={n} className="lp-step" role="listitem">
                    <div className="lp-step-num" aria-hidden="true">{n}</div>
                    <div>
                      <h3>{title}</h3>
                      <p>{body}</p>
                    </div>
                  </div>
                ))}
              </div>

              <div className="lp-convo" aria-hidden="true">
                <div>
                  <div className="lp-msg-meta">Customer · TKT-042 · 9:14 AM</div>
                  <div className="lp-msg lp-msg-in">Hi, I've been locked out of my account since yesterday and have a demo in 2 hours. Please help urgently!</div>
                </div>
                <div>
                  <div className="lp-msg-meta lp-msg-meta-right">Sarah (Agent) · 9:16 AM</div>
                  <div className="lp-msg lp-msg-out">Hi! I'm on it right now. Resetting your session tokens — you should be able to log in within 5 minutes.</div>
                </div>
                <div>
                  <div className="lp-msg-meta">Internal note · 9:17 AM</div>
                  <div className="lp-msg lp-msg-note">Root cause: expired OAuth token not cleared on password reset. Flagged for dev team — fix in next sprint.</div>
                </div>
                <div>
                  <div className="lp-msg-meta lp-msg-meta-right">Sarah (Agent) · 9:22 AM</div>
                  <div className="lp-msg lp-msg-out">All fixed! Your account is back. Good luck with the demo!</div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ── TECH STACK ────────────────────────────────────── */}
        <section id="lp-stack" className="lp-section lp-section-white" aria-labelledby="lp-stack-h2">
          <div className="lp-container">
            <div className="lp-centered">
              <div className="lp-label">
                <Icon width="14" height="14">
                  <polyline points="16 18 22 12 16 6" /><polyline points="8 6 2 12 8 18" />
                </Icon>
                Under the hood
              </div>
              <h2 id="lp-stack-h2" className="lp-title">The tech stack</h2>
              <p className="lp-sub">Built end-to-end with a modern but dependency-light stack. No UI framework, no ORM, no magic.</p>
            </div>

            <div className="lp-stack-grid">
              {[
                {
                  icon: (
                    <Icon width="28" height="28" stroke="none" fill="currentColor">
                      <path d="M12 2C6.477 2 2 6.477 2 12s4.477 10 10 10 10-4.477 10-10S17.523 2 12 2zm.5 14.5h-1v-5h1v5zm0-7h-1V8h1v1.5z" />
                    </Icon>
                  ),
                  tech: 'React 19 + Vite 8',
                  role: 'Frontend',
                  points: ['No TypeScript — plain JSX', 'React Context for state', 'CSS custom properties only', 'Vite HMR + production build'],
                  color: '#5b5ef4',
                },
                {
                  icon: (
                    <Icon width="28" height="28" stroke="none" fill="currentColor">
                      <path d="M12 2a10 10 0 1 0 10 10A10 10 0 0 0 12 2zm1 14.93V15a1 1 0 0 0-2 0v1.93A8 8 0 0 1 4.07 9H6a1 1 0 0 0 0-2H4.07A8 8 0 0 1 11 4.07V6a1 1 0 0 0 2 0V4.07A8 8 0 0 1 19.93 11H18a1 1 0 0 0 0 2h1.93A8 8 0 0 1 13 16.93z" />
                    </Icon>
                  ),
                  tech: 'Node.js + Express',
                  role: 'Backend API',
                  points: ['30+ REST endpoints', 'Session auth with connect-pg-simple', 'nodemailer SMTP integration', 'Background SLA poller'],
                  color: '#10b981',
                },
                {
                  icon: (
                    <Icon width="28" height="28" stroke="none" fill="currentColor">
                      <ellipse cx="12" cy="5" rx="9" ry="3" /><path d="M3 5v14c0 1.657 4.03 3 9 3s9-1.343 9-3V5" /><path d="M3 12c0 1.657 4.03 3 9 3s9-1.343 9-3" />
                    </Icon>
                  ),
                  tech: 'PostgreSQL',
                  role: 'Database',
                  points: ['10 tables, raw SQL queries', 'pg.Pool with transactions', 'Additive schema migrations', 'Seed data for demo mode'],
                  color: '#3b82f6',
                },
                {
                  icon: (
                    <Icon width="28" height="28">
                      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                    </Icon>
                  ),
                  tech: 'Auth + SLA Engine',
                  role: 'Core Systems',
                  points: ['bcrypt password hashing', 'Rolling sessions (1-week TTL)', 'Per-company SLA policies', 'Full audit event log'],
                  color: '#7c3aed',
                },
              ].map(({ icon, tech, role, points, color }) => (
                <div key={tech} className="lp-stack-card" style={{ '--stack-color': color }}>
                  <div className="lp-stack-icon" aria-hidden="true" style={{ color }}>
                    {icon}
                  </div>
                  <div className="lp-stack-role">{role}</div>
                  <h3 className="lp-stack-tech">{tech}</h3>
                  <ul className="lp-stack-points">
                    {points.map(p => (
                      <li key={p}><CheckIcon />{p}</li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ── FAQ ───────────────────────────────────────────── */}
        <section id="lp-faq" className="lp-section" aria-labelledby="lp-faq-h2">
          <div className="lp-container">
            <div className="lp-centered">
              <div className="lp-label">
                <Icon width="14" height="14">
                  <circle cx="12" cy="12" r="10" />
                  <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" />
                  <line x1="12" y1="17" x2="12.01" y2="17" />
                </Icon>
                FAQ
              </div>
              <h2 id="lp-faq-h2" className="lp-title">Frequently asked questions</h2>
            </div>
            <div className="lp-faq-list" role="list">
              {[
                {
                  q: 'What is SupportDesk?',
                  a: 'SupportDesk is a personal full-stack project — a fully-featured customer support ticketing system built from scratch as a portfolio piece. It demonstrates real-world patterns: REST APIs, session auth, SLA policies, audit trails, and a responsive React frontend.',
                },
                {
                  q: 'Can I self-host it?',
                  a: 'Yes. The project ships with a Docker-ready Express + PostgreSQL stack. Set DATABASE_URL and SESSION_SECRET, run npm ci && node server/index.js, and you\'re up. The nixpacks.toml also makes one-click deployment to Coolify or Railway straightforward.',
                },
                {
                  q: 'What\'s the full tech stack?',
                  a: 'Frontend: React 19 + Vite 8, plain CSS (no Tailwind or UI library). Backend: Node.js + Express (CommonJS). Database: PostgreSQL via node-postgres. Auth: express-session + bcrypt + connect-pg-simple. Email: nodemailer with SMTP. Charts: Recharts.',
                },
                {
                  q: 'How does the SLA system work?',
                  a: 'Each ticket gets first-response and resolution deadlines computed from a policy (default or per-company). Deadlines are stored on the ticket row and recalculated when priority changes. A background poller runs every 5 minutes and sends warning emails to assignees approaching breach.',
                },
                {
                  q: 'Is there a demo I can explore?',
                  a: 'Yes — click "Explore the app" and sign in with the demo credentials (shown on the login screen). The demo runs against a real PostgreSQL database so you can create tickets, assign agents, and see the SLA countdown in action.',
                },
              ].map(({ q, a }) => (
                <FaqItem key={q} q={q} a={a} />
              ))}
            </div>
          </div>
        </section>

        {/* ── CTA BANNER ────────────────────────────────────── */}
        <div className="lp-container lp-cta-wrap">
          <div className="lp-cta-banner">
            <h2>See it running</h2>
            <p>Explore the full app — create tickets, assign agents, trigger SLA alerts, and browse the audit trail.</p>
            <div className="lp-cta-actions">
              <button className="lp-btn lp-btn-cta" onClick={onSignIn}>
                <Icon width="18" height="18" stroke="currentColor" strokeWidth="2.5">
                  <path d="M5 12h14M12 5l7 7-7 7" />
                </Icon>
                Open the demo
              </button>
              <a href="https://github.com/dragneel101/ticketingSystem" className="lp-btn lp-btn-ghost" target="_blank" rel="noopener noreferrer">
                <Icon width="16" height="16">
                  <path d="M9 19c-5 1.5-5-2.5-7-3m14 6v-3.87a3.37 3.37 0 0 0-.94-2.61c3.14-.35 6.44-1.54 6.44-7A5.44 5.44 0 0 0 20 4.77 5.07 5.07 0 0 0 19.91 1S18.73.65 16 2.48a13.38 13.38 0 0 0-7 0C6.27.65 5.09 1 5.09 1A5.07 5.07 0 0 0 5 4.77a5.44 5.44 0 0 0-1.5 3.78c0 5.42 3.3 6.61 6.44 7A3.37 3.37 0 0 0 9 18.13V22" />
                </Icon>
                View on GitHub
              </a>
            </div>
          </div>
        </div>
      </main>

      {/* ── FOOTER ────────────────────────────────────────── */}
      <footer className="lp-footer">
        <div className="lp-container">
          <div className="lp-footer-inner">
            <div className="lp-footer-brand">
              <button className="lp-footer-logo" onClick={scrollToTop}>
                <div className="lp-footer-logo-icon" aria-hidden="true">
                  <Icon width="16" height="16" stroke="#fff" strokeWidth="2.5">
                    <rect x="2" y="7" width="20" height="14" rx="2" />
                    <path d="M16 3 8 3 6 7h12z" />
                    <line x1="12" y1="12" x2="12" y2="17" />
                    <line x1="9.5" y1="14.5" x2="14.5" y2="14.5" />
                  </Icon>
                </div>
                SupportDesk
              </button>
              <p>A personal full-stack project. Built to explore real-world patterns in React, Node.js, and PostgreSQL.</p>
            </div>

            <div className="lp-footer-links">
              <div className="lp-footer-col">
                <h4>Navigate</h4>
                <ul>
                  <li><a href="#lp-features">Features</a></li>
                  <li><a href="#lp-how">How it works</a></li>
                  <li><a href="#lp-stack">Tech stack</a></li>
                  <li><a href="#lp-faq">FAQ</a></li>
                </ul>
              </div>
              <div className="lp-footer-col">
                <h4>Project</h4>
                <ul>
                  <li><a href="https://github.com/dragneel101/ticketingSystem" target="_blank" rel="noopener noreferrer">GitHub</a></li>
                  <li><button onClick={onSignIn}>Sign in</button></li>
                </ul>
              </div>
            </div>
          </div>

          <div className="lp-footer-bottom">
            <span>SupportDesk — personal project</span>
            <span className="lp-footer-tagline">React · Node.js · PostgreSQL</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
