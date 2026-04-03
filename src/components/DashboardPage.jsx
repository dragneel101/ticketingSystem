import { useMemo, lazy, Suspense } from 'react';

const DashboardCharts = lazy(() => import('./DashboardCharts'));
import { useTickets } from '../context/TicketContext';
import { useAuth } from '../context/AuthContext';
import { STATUS_LABELS } from '../utils/statusConfig';
import SlaCountdown from './SlaCountdown';

// ─── helpers ────────────────────────────────────────────────────────────────

function fmtDate(iso) {
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(new Date(iso));
}

function cap(str) {
  return str.charAt(0).toUpperCase() + str.slice(1);
}

// ─── constants ───────────────────────────────────────────────────────────────

const STATUS_COLORS = {
  'unassigned':            '#9aa3b5',
  'assigned':              '#3b82f6',
  'in-progress':           '#7c3aed',
  'requesting-escalation': '#ef4444',
  'pending-client':        '#f0a500',
  'pending-vendor':        '#8b5cf6',
  'scheduled':             '#10b981',
  'resolved':              '#17a2b8',
  'closed':                '#6b7280',
};

const STATUS_CHART_ORDER = [
  { key: 'unassigned',            label: 'Unassigned' },
  { key: 'assigned',              label: 'Assigned' },
  { key: 'in-progress',          label: 'In Progress' },
  { key: 'requesting-escalation', label: 'Escalation' },
  { key: 'pending-client',        label: 'Pending Client' },
  { key: 'pending-vendor',        label: 'Pending Vendor' },
  { key: 'scheduled',             label: 'Scheduled' },
  { key: 'resolved',              label: 'Resolved' },
  { key: 'closed',                label: 'Closed' },
];

const PRIORITY_COLORS = {
  urgent: '#e74c3c',
  high:   '#e67e22',
  medium: '#3498db',
  low:    '#9aa3b5',
};

// ─── sub-components ─────────────────────────────────────────────────────────

function StatCard({ label, value, accent, breach }) {
  return (
    <div
      className={`dash-stat-card${breach ? ' dash-stat-card--breach' : ''}`}
      style={{ '--accent': accent }}
    >
      <span className="dash-stat-value">{value}</span>
      <span className="dash-stat-label">{label}</span>
    </div>
  );
}

// ─── main component ─────────────────────────────────────────────────────────

export default function DashboardPage({ onViewTicket, onNavigate }) {
  const { tickets, loading } = useTickets();
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';

  const metrics = useMemo(() => {
    const byStatus = {};
    const byPriority = { low: 0, medium: 0, high: 0, urgent: 0 };
    let noOwner = 0;
    let assignedToMe = 0;

    for (const t of tickets) {
      // Per-status counts — keys match statusConfig keys exactly
      byStatus[t.status] = (byStatus[t.status] || 0) + 1;

      if (byPriority[t.priority] !== undefined) byPriority[t.priority]++;

      if (t.assignedTo === null || t.assignedTo === undefined) noOwner++;

      if (user && t.assignedTo === user.id) assignedToMe++;
    }

    // Chart data arrays
    const statusChartData = STATUS_CHART_ORDER.map(({ key, label }) => ({
      name: label,
      key,
      value: byStatus[key] || 0,
      color: STATUS_COLORS[key],
    }));

    const priorityChartData = [
      { name: 'Urgent', value: byPriority.urgent || 0, color: PRIORITY_COLORS.urgent },
      { name: 'High',   value: byPriority.high   || 0, color: PRIORITY_COLORS.high },
      { name: 'Medium', value: byPriority.medium || 0, color: PRIORITY_COLORS.medium },
      { name: 'Low',    value: byPriority.low    || 0, color: PRIORITY_COLORS.low },
    ];

    // Recent activity: last 8 tickets by creation date, newest first
    const recent = tickets
      .slice()
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
      .slice(0, 8);

    // SLA breach/warning computations
    const now = Date.now();
    const SIXTY_MIN = 60 * 60_000;
    const TERMINAL = new Set(['resolved', 'closed']);

    let slaBreached = 0;
    const breachingSoon = [];

    for (const t of tickets) {
      if (!t.resolutionDueAt || TERMINAL.has(t.status)) continue;
      const diffMs = new Date(t.resolutionDueAt) - now;
      if (diffMs <= 0) {
        slaBreached++;
      } else if (diffMs <= SIXTY_MIN) {
        breachingSoon.push(t);
      }
    }

    // Sort breaching-soon by most urgent first, cap at 5
    breachingSoon.sort((a, b) => new Date(a.resolutionDueAt) - new Date(b.resolutionDueAt));
    const breachingSoonSlice = breachingSoon.slice(0, 5);

    return { byStatus, byPriority, statusChartData, priorityChartData, recent, noOwner, assignedToMe, slaBreached, breachingSoon: breachingSoonSlice };
  }, [tickets, user]);

  // ── loading state ────────────────────────────────────────────────────────
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

      {/* ── page header ───────────────────────────────────────────────────── */}
      <div className="dash-header">
        <div className="dash-header-inner">
          <div>
            <h1 className="dash-title">Dashboard</h1>
            <p className="dash-subtitle">
              {isEmpty
                ? 'No tickets yet — create one to get started.'
                : `Overview across ${tickets.length} ticket${tickets.length !== 1 ? 's' : ''}`}
            </p>
          </div>
        </div>
      </div>

      <div className="dash-body">

        {/* ── stat cards row ──────────────────────────────────────────────── */}
        <div className="dash-stat-row">
          <StatCard label="Total"          value={tickets.length}                      accent="var(--brand)" />
          <StatCard label="Unassigned"     value={metrics.byStatus['unassigned'] || 0} accent={STATUS_COLORS['unassigned']} />
          <StatCard label="Assigned"       value={metrics.byStatus['assigned'] || 0}   accent={STATUS_COLORS['assigned']} />
          <StatCard label="In Progress"    value={metrics.byStatus['in-progress'] || 0} accent={STATUS_COLORS['in-progress']} />
          <StatCard label="Escalation"     value={metrics.byStatus['requesting-escalation'] || 0} accent={STATUS_COLORS['requesting-escalation']} />
          <StatCard label="Pending Client" value={metrics.byStatus['pending-client'] || 0} accent={STATUS_COLORS['pending-client']} />
          <StatCard label="Pending Vendor" value={metrics.byStatus['pending-vendor'] || 0} accent={STATUS_COLORS['pending-vendor']} />
          <StatCard label="Scheduled"      value={metrics.byStatus['scheduled'] || 0}  accent={STATUS_COLORS['scheduled']} />
          <StatCard label="Resolved"       value={metrics.byStatus['resolved'] || 0}   accent={STATUS_COLORS['resolved']} />
          <StatCard label="Closed"         value={metrics.byStatus['closed'] || 0}     accent={STATUS_COLORS['closed']} />
          <StatCard
            label="No Owner"
            value={metrics.noOwner}
            accent={metrics.noOwner > 0 ? '#ef4444' : '#9aa3b5'}
          />
          <StatCard
            label="SLA Breached"
            value={metrics.slaBreached}
            accent={metrics.slaBreached > 0 ? 'var(--sla-breach-text)' : '#9aa3b5'}
            breach={metrics.slaBreached > 0}
          />
          {(user?.role === 'agent' || user?.role === 'admin') && (
            <StatCard label="Mine" value={metrics.assignedToMe} accent="var(--brand)" />
          )}
        </div>

        {/* ── breaching soon ───────────────────────────────────────────────── */}
        {metrics.breachingSoon.length > 0 && (
          <section className="dash-card dash-breaching-soon" aria-label="Tickets breaching SLA soon">
            <h2 className="dash-card-title">
              Breaching Soon
              <span className="dash-breaching-badge">{metrics.breachingSoon.length}</span>
            </h2>
            <ul className="dash-recent-list">
              {metrics.breachingSoon.map((ticket) => (
                <li key={ticket.id} className="dash-recent-row">
                  <div className="dash-recent-info">
                    <span className="dash-recent-id">{ticket.id}</span>
                    <span className="dash-recent-subject">{ticket.subject}</span>
                  </div>
                  <div className="dash-recent-meta">
                    <SlaCountdown dueAt={ticket.resolutionDueAt} compact />
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
          </section>
        )}

        {/* ── charts row ──────────────────────────────────────────────────── */}
        {!isEmpty && (
          <Suspense fallback={<div className="dash-charts-row dash-charts-loading" />}>
            <DashboardCharts
              statusChartData={metrics.statusChartData}
              priorityChartData={metrics.priorityChartData}
            />
          </Suspense>
        )}

        {/* ── recent activity ──────────────────────────────────────────────── */}
        <section className="dash-card" aria-label="Recent activity">
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
                    <span className={`badge badge-${ticket.status}`}>
                      {STATUS_LABELS[ticket.status] ?? cap(ticket.status)}
                    </span>

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

        {/* ── admin quick actions ──────────────────────────────────────────── */}
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
                  <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
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
