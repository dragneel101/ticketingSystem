import { useState, useMemo, useRef, useCallback, useEffect } from 'react';
import { useTickets } from '../context/TicketContext';
import { useAuth } from '../context/AuthContext';

/* ── helpers ─────────────────────────────────────────────── */
function initials(name) {
  if (!name) return '?';
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].charAt(0).toUpperCase();
  return (parts[0].charAt(0) + parts[parts.length - 1].charAt(0)).toUpperCase();
}

function formatDate(iso) {
  const date = new Date(iso);
  const now = new Date();
  const diffMs = now - date;
  const diffDays = Math.floor(diffMs / 86_400_000);

  if (diffDays === 0) {
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }
  if (diffDays < 7) {
    return date.toLocaleDateString([], { weekday: 'short' });
  }
  return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
}

function PriorityBadge({ priority }) {
  return (
    <span className={`badge badge-${priority}`}>
      {priority}
    </span>
  );
}

function StatusBadge({ status }) {
  return (
    <span className={`badge badge-${status}`}>
      {status}
    </span>
  );
}

/* ── stat counts ─────────────────────────────────────────── */
function TicketStats({ tickets }) {
  const counts = useMemo(() => {
    return tickets.reduce(
      (acc, t) => {
        acc[t.status] = (acc[t.status] || 0) + 1;
        return acc;
      },
      { open: 0, pending: 0, resolved: 0, closed: 0 }
    );
  }, [tickets]);

  const stats = [
    { label: 'Open',     value: counts.open,     color: 'var(--s-open-dot)' },
    { label: 'Pending',  value: counts.pending,  color: 'var(--s-pending-dot)' },
    { label: 'Resolved', value: counts.resolved, color: 'var(--s-resolved-dot)' },
    { label: 'Closed',   value: counts.closed,   color: 'var(--s-closed-dot)' },
  ];

  return (
    <div className="tl-stats" role="region" aria-label="Ticket counts">
      {stats.map((s) => (
        <div className="tl-stat-chip" key={s.label} title={`${s.value} ${s.label}`}>
          <span
            className="tl-stat-num"
            style={{ color: s.value > 0 ? s.color : 'var(--gray-400)' }}
          >
            {s.value}
          </span>
          <span className="tl-stat-label">{s.label}</span>
        </div>
      ))}
    </div>
  );
}

/* ── main component ──────────────────────────────────────── */
export default function TicketList({ selectedId, onSelect, onNewTicket }) {
  const { tickets, meta, loadMoreTickets } = useTickets();
  const { user } = useAuth();
  const [filterStatus, setFilterStatus] = useState('all');
  const [loadingMore, setLoadingMore] = useState(false);
  const [filterPriority, setFilterPriority] = useState('all');
  const [filterAssignee, setFilterAssignee] = useState('all');
  const [agents, setAgents] = useState([]);
  const [search, setSearch] = useState('');
  const listRef = useRef(null);

  useEffect(() => {
    fetch('/api/auth/agents')
      .then((r) => r.ok ? r.json() : Promise.reject())
      .then(setAgents)
      .catch(() => {});
  }, []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return tickets.filter((t) => {
      const statusOk = filterStatus === 'all' || t.status === filterStatus;
      const priorityOk = filterPriority === 'all' || t.priority === filterPriority;
      const searchOk = !q ||
        t.subject.toLowerCase().includes(q) ||
        t.customerEmail.toLowerCase().includes(q);

      let assigneeOk = true;
      if (filterAssignee === 'unassigned') {
        assigneeOk = t.assignedTo === null || t.assignedTo === undefined;
      } else if (filterAssignee === 'me') {
        assigneeOk = t.assignedTo === user?.id;
      } else if (filterAssignee !== 'all') {
        assigneeOk = t.assignedTo === parseInt(filterAssignee, 10);
      }

      return statusOk && priorityOk && searchOk && assigneeOk;
    });
  }, [tickets, filterStatus, filterPriority, filterAssignee, search, user?.id]);

  const handleListKeyDown = useCallback((e) => {
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
    e.preventDefault();

    if (filtered.length === 0) return;

    const currentIndex = filtered.findIndex((t) => t.id === selectedId);
    let nextIndex;

    if (e.key === 'ArrowDown') {
      nextIndex = currentIndex < filtered.length - 1 ? currentIndex + 1 : 0;
    } else {
      nextIndex = currentIndex > 0 ? currentIndex - 1 : filtered.length - 1;
    }

    const nextId = filtered[nextIndex].id;
    onSelect(nextId);

    const card = listRef.current?.querySelector(`#ticket-${nextId}`);
    card?.focus();
  }, [filtered, selectedId, onSelect]);

  async function handleLoadMore() {
    setLoadingMore(true);
    try {
      await loadMoreTickets();
    } finally {
      setLoadingMore(false);
    }
  }

  const hasActiveFilters =
    filterStatus !== 'all' ||
    filterPriority !== 'all' ||
    filterAssignee !== 'all' ||
    search.trim() !== '';

  function clearFilters() {
    setFilterStatus('all');
    setFilterPriority('all');
    setFilterAssignee('all');
    setSearch('');
  }

  return (
    <div className="tl-page" aria-label="Ticket list">
      {/* ── Page header ── */}
      <div className="tl-header">
        <div className="tl-header-title-row">
          <h1 className="tl-page-title">Tickets</h1>
          <span className="tl-page-count">{filtered.length} of {tickets.length}</span>
        </div>
        <button
          className="btn-new-ticket"
          onClick={onNewTicket}
          aria-label="Create new ticket"
        >
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
            <path d="M7 1v12M1 7h12" stroke="#fff" strokeWidth="2" strokeLinecap="round" />
          </svg>
          New Ticket
        </button>
      </div>

      {/* ── Toolbar: search + filters ── */}
      <div className="tl-toolbar" role="search" aria-label="Search and filter tickets">
        {/* Search */}
        <div className="tl-search-wrap">
          <svg className="tl-search-icon" width="13" height="13" viewBox="0 0 12 12" fill="none" aria-hidden="true">
            <circle cx="5" cy="5" r="3.5" stroke="currentColor" strokeWidth="1.4" />
            <path d="M8 8l2.5 2.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
          </svg>
          <label htmlFor="ticket-search" className="visually-hidden">Search tickets</label>
          <input
            id="ticket-search"
            type="search"
            className="tl-search-input"
            placeholder="Search subject or email…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            autoComplete="off"
            spellCheck={false}
          />
          {search && (
            <button
              className="tl-search-clear"
              onClick={() => setSearch('')}
              aria-label="Clear search"
              tabIndex={-1}
            >
              <svg width="8" height="8" viewBox="0 0 8 8" fill="none" aria-hidden="true">
                <path d="M1 1l6 6M7 1L1 7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
              </svg>
            </button>
          )}
        </div>

        {/* Selects */}
        <div className="tl-filters">
          <label htmlFor="filter-status" className="visually-hidden">Filter by status</label>
          <select
            id="filter-status"
            className="tl-select"
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
          >
            <option value="all">All Statuses</option>
            <option value="open">Open</option>
            <option value="pending">Pending</option>
            <option value="resolved">Resolved</option>
            <option value="closed">Closed</option>
          </select>

          <label htmlFor="filter-priority" className="visually-hidden">Filter by priority</label>
          <select
            id="filter-priority"
            className="tl-select"
            value={filterPriority}
            onChange={(e) => setFilterPriority(e.target.value)}
          >
            <option value="all">All Priorities</option>
            <option value="urgent">Urgent</option>
            <option value="high">High</option>
            <option value="medium">Medium</option>
            <option value="low">Low</option>
          </select>

          <label htmlFor="filter-assignee" className="visually-hidden">Filter by assignee</label>
          <select
            id="filter-assignee"
            className="tl-select"
            value={filterAssignee}
            onChange={(e) => setFilterAssignee(e.target.value)}
          >
            <option value="all">All Assignees</option>
            <option value="unassigned">Unassigned</option>
            <option value="me">Assigned to me</option>
            {agents.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>

          {hasActiveFilters && (
            <button className="tl-clear-btn" onClick={clearFilters}>
              Clear
            </button>
          )}
        </div>
      </div>

      {/* ── Stats chips ── */}
      <TicketStats tickets={tickets} />

      {/* ── Column header ── */}
      {filtered.length > 0 && (
        <div className="tl-col-header" aria-hidden="true">
          <span className="tl-col-id">Ref</span>
          <span className="tl-col-subject">Subject</span>
          <span className="tl-col-customer">Customer</span>
          <span className="tl-col-assignee">Assignee</span>
          <span className="tl-col-badges">Priority / Status</span>
          <span className="tl-col-date">Created</span>
        </div>
      )}

      {/* ── List ── */}
      <div
        ref={listRef}
        className="tl-list"
        role="listbox"
        aria-label="Tickets"
        aria-activedescendant={selectedId ? `ticket-${selectedId}` : undefined}
        onKeyDown={handleListKeyDown}
      >
        {filtered.length === 0 ? (
          <div className="tl-empty" role="status">
            <svg width="40" height="40" viewBox="0 0 36 36" fill="none" aria-hidden="true">
              <rect x="4" y="6" width="28" height="24" rx="4" stroke="var(--gray-300)" strokeWidth="1.5" />
              <path d="M10 13h16M10 18h10M10 23h7" stroke="var(--gray-300)" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
            <p className="tl-empty-title">No tickets match your filters</p>
            {hasActiveFilters && (
              <button className="tl-clear-btn" onClick={clearFilters}>
                Clear filters
              </button>
            )}
          </div>
        ) : (
          filtered.map((ticket) => (
            <TicketRow
              key={ticket.id}
              ticket={ticket}
              isActive={ticket.id === selectedId}
              onClick={() => onSelect(ticket.id)}
            />
          ))
        )}
      </div>

      {/* ── Load more ── */}
      {meta.hasMore && (
        <div className="tl-load-more-wrap">
          <button
            className="tl-load-more"
            onClick={handleLoadMore}
            disabled={loadingMore}
          >
            {loadingMore ? 'Loading…' : `Load more · ${meta.total - tickets.length} remaining`}
          </button>
        </div>
      )}
    </div>
  );
}

/* ── ticket row ──────────────────────────────────────────── */
function TicketRow({ ticket, isActive, onClick }) {
  return (
    <div
      id={`ticket-${ticket.id}`}
      className={`tl-row${isActive ? ' tl-row--active' : ''}`}
      onClick={onClick}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onClick();
        }
      }}
      role="option"
      aria-selected={isActive}
      tabIndex={0}
    >
      {/* Ref ID */}
      <span className="tl-row-id">{ticket.id}</span>

      {/* Subject */}
      <span className="tl-row-subject">{ticket.subject}</span>

      {/* Customer */}
      <div className="tl-row-customer">
        <span className="tl-row-name">{ticket.customerName || '—'}</span>
        <span className="tl-row-email">{ticket.customerEmail}</span>
      </div>

      {/* Assignee */}
      <div className="tl-row-assignee">
        {ticket.assignedTo ? (
          <>
            <span className="tl-row-avatar" aria-hidden="true">
              {initials(ticket.assigneeName)}
            </span>
            <span className="tl-row-assignee-name">{ticket.assigneeName}</span>
          </>
        ) : (
          <span className="tl-row-unassigned">Unassigned</span>
        )}
      </div>

      {/* Badges */}
      <div className="tl-row-badges">
        <PriorityBadge priority={ticket.priority} />
        <StatusBadge status={ticket.status} />
      </div>

      {/* Date */}
      <span className="tl-row-date">{formatDate(ticket.createdAt)}</span>

      {/* Arrow cue */}
      <svg className="tl-row-arrow" width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
        <path d="M5 3l4 4-4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </div>
  );
}
