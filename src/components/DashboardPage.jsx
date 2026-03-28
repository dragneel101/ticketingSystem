import { useMemo } from 'react';
import { useTickets } from '../context/TicketContext';
import { useAuth } from '../context/AuthContext';

// ─── helpers ────────────────────────────────────────────────────────────────

// Format an ISO date string into something readable (e.g. "Mar 27, 2026").
// Using Intl.DateTimeFormat rather than a library keeps bundle size at zero.
function fmtDate(iso) {
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(new Date(iso));
}

// Capitalise the first letter — used for status/priority display labels.
function cap(str) {
  return str.charAt(0).toUpperCase() + str.slice(1);
}

// ─── sub-components ─────────────────────────────────────────────────────────

// A single stat card: big number + label underneath.
function StatCard({ label, value, accent }) {
  return (
    <div className="dash-stat-card" style={{ '--accent': accent }}>
      <span className="dash-stat-value">{value}</span>
      <span className="dash-stat-label">{label}</span>
    </div>
  );
}

// One horizontal bar in the priority breakdown chart.
// `pct` is 0–100, representing this priority's share of the max bar width.
// We use an inline style for the width so we can drive it purely from data —
// no need for a separate CSS class per percentage value.
function PriorityBar({ priority, count, pct }) {
  return (
    <div className="dash-bar-row">
      <span className="dash-bar-label">
        {/* Priority dot — reuses the existing --p-{priority}-dot token */}
        <span
          className="dash-bar-dot"
          style={{ background: `var(--p-${priority}-dot)` }}
        />
        {cap(priority)}
      </span>

      {/* Track + filled bar */}
      <div className="dash-bar-track">
        <div
          className="dash-bar-fill"
          style={{
            width: `${pct}%`,
            background: `var(--p-${priority}-dot)`,
          }}
        />
      </div>

      <span className="dash-bar-count">{count}</span>
    </div>
  );
}

// ─── main component ─────────────────────────────────────────────────────────

export default function DashboardPage({ onViewTicket, onNavigate }) {
  const { tickets, loading } = useTickets();
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';

  // ── derived metrics ──────────────────────────────────────────────────────
  //
  // useMemo here: `tickets` is the only dependency. All of these aggregations
  // run in a single pass over the array (O(n)), so we do them together rather
  // than separate reduce calls. Even though the work is cheap, useMemo makes
  // the dependency boundary explicit — if `tickets` doesn't change, none of
  // these values recompute, regardless of what else re-renders in the tree.
  const metrics = useMemo(() => {
    const byStatus = { open: 0, pending: 0, resolved: 0, closed: 0 };
    const byPriority = { low: 0, medium: 0, high: 0, urgent: 0 };

    for (const t of tickets) {
      if (byStatus[t.status] !== undefined) byStatus[t.status]++;
      if (byPriority[t.priority] !== undefined) byPriority[t.priority]++;
    }

    // Recent activity: last 7 tickets by creation date, newest first.
    // slice() first so we don't mutate the context array — sort is in-place.
    const recent = tickets
      .slice()
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
      .slice(0, 7);

    // Largest count among priority buckets — used to scale bar widths so the
    // highest bar always fills 100% of its track (like a mini chart axis).
    const maxPriority = Math.max(...Object.values(byPriority), 1); // floor at 1 avoids /0

    return { byStatus, byPriority, recent, maxPriority };
  }, [tickets]);

  // ── loading / empty states ───────────────────────────────────────────────
  if (loading) {
    return (
      <div className="dash-page">
        <div className="dash-loading" aria-label="Loading dashboard">
          <div className="dash-loading-spinner" />
          <span>Loading dashboard...</span>
        </div>
      </div>
    );
  }

  const isEmpty = tickets.length === 0;

  return (
    <div className="dash-page">

      {/* ── page header ─────────────────────────────────────────────────── */}
      <div className="dash-header">
        <div>
          <h1 className="dash-title">Dashboard</h1>
          <p className="dash-subtitle">
            {isEmpty
              ? 'No tickets yet — create one to get started.'
              : `Overview across ${tickets.length} ticket${tickets.length !== 1 ? 's' : ''}`}
          </p>
        </div>
      </div>

      <div className="dash-body">

        {/* ── stat cards row ──────────────────────────────────────────────── */}
        <div className="dash-stat-row">
          <StatCard label="Total" value={tickets.length} accent="var(--brand)" />
          <StatCard label="Open" value={metrics.byStatus.open} accent="var(--s-open-dot)" />
          <StatCard label="Pending" value={metrics.byStatus.pending} accent="var(--s-pending-dot)" />
          <StatCard label="Resolved" value={metrics.byStatus.resolved} accent="var(--s-resolved-dot)" />
          <StatCard label="Closed" value={metrics.byStatus.closed} accent="var(--s-closed-dot)" />
        </div>

        {/* ── lower grid: priority chart + recent tickets ──────────────── */}
        <div className="dash-grid">

          {/* Priority breakdown — CSS bar chart, no external library */}
          <section className="dash-card" aria-label="Tickets by priority">
            <h2 className="dash-card-title">By Priority</h2>

            {isEmpty ? (
              <p className="dash-empty-section">No tickets to display.</p>
            ) : (
              <div className="dash-bar-chart">
                {['urgent', 'high', 'medium', 'low'].map((priority) => {
                  const count = metrics.byPriority[priority];
                  // Scale relative to the tallest bar, so the layout stays proportional.
                  // Example: if urgent=8 and low=2, urgent bar = 100%, low bar = 25%.
                  const pct = (count / metrics.maxPriority) * 100;
                  return (
                    <PriorityBar
                      key={priority}
                      priority={priority}
                      count={count}
                      pct={pct}
                    />
                  );
                })}
              </div>
            )}
          </section>

          {/* Recent activity */}
          <section className="dash-card dash-card--wide" aria-label="Recent activity">
            <h2 className="dash-card-title">Recent Activity</h2>

            {isEmpty ? (
              <p className="dash-empty-section">No tickets yet.</p>
            ) : (
              <ul className="dash-recent-list">
                {metrics.recent.map((ticket) => (
                  <li key={ticket.id} className="dash-recent-row">
                    <div className="dash-recent-info">
                      <span className="dash-recent-id">{ticket.id}</span>
                      <span className="dash-recent-subject">{ticket.subject}</span>
                      <span className="dash-recent-date">{fmtDate(ticket.createdAt)}</span>
                    </div>

                    <div className="dash-recent-meta">
                      {/* Status badge — reuses existing .badge .badge-{status} classes */}
                      <span className={`badge badge-${ticket.status}`}>
                        {cap(ticket.status)}
                      </span>

                      {/* Priority dot — a pure visual indicator, label is redundant here */}
                      <span
                        className="dash-priority-dot"
                        title={cap(ticket.priority)}
                        style={{ background: `var(--p-${ticket.priority}-dot)` }}
                        aria-label={`Priority: ${ticket.priority}`}
                      />

                      <button
                        className="dash-view-btn"
                        onClick={() => onViewTicket(ticket.id)}
                        aria-label={`View ticket ${ticket.id}`}
                      >
                        View
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>

        {/* ── admin quick actions ──────────────────────────────────────────
             Only rendered for admin users. Prop-drilling onNavigate here is
             intentional: this is a leaf component that fires a parent action.
             There's no need to reach into context for something this narrow. */}
        {isAdmin && (
          <section className="dash-card dash-quick-actions" aria-label="Quick actions">
            <h2 className="dash-card-title">Quick Actions</h2>
            <div className="dash-action-row">
              <button
                className="dash-action-btn"
                onClick={() => onNavigate('users')}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                  <circle cx="9" cy="7" r="4" />
                  <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
                  <path d="M16 3.13a4 4 0 0 1 0 7.75" />
                </svg>
                Manage Users
              </button>

              <button
                className="dash-action-btn"
                onClick={() => onNavigate('settings')}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <circle cx="12" cy="12" r="3" />
                  <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
                </svg>
                Settings
              </button>
            </div>
          </section>
        )}

      </div>
    </div>
  );
}
