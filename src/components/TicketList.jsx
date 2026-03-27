import { useState, useMemo, useRef, useCallback } from 'react';
import { useTickets } from '../context/TicketContext';

/* ── helpers ─────────────────────────────────────────────── */
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
    <span className={`badge badge-${priority} badge-dark`}>
      {priority}
    </span>
  );
}

function StatusBadge({ status }) {
  return (
    <span className={`badge badge-${status} badge-dark`}>
      {status}
    </span>
  );
}

/* ── stat counts ─────────────────────────────────────────── */
function SidebarStats({ tickets }) {
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
    { label: 'Open', value: counts.open, color: 'var(--s-open-dot)' },
    { label: 'Pending', value: counts.pending, color: 'var(--s-pending-dot)' },
    { label: 'Resolved', value: counts.resolved, color: 'var(--s-resolved-dot)' },
    { label: 'Closed', value: counts.closed, color: 'var(--s-closed-dot)' },
  ];

  return (
    <div className="sidebar-stats" role="region" aria-label="Ticket counts">
      {stats.map((s) => (
        <div className="stat-chip" key={s.label} title={`${s.value} ${s.label}`}>
          <span
            className="stat-chip-num"
            style={{ color: s.value > 0 ? s.color : 'var(--sidebar-text)' }}
          >
            {s.value}
          </span>
          <span className="stat-chip-label">{s.label}</span>
        </div>
      ))}
    </div>
  );
}

/* ── main component ──────────────────────────────────────── */
export default function TicketList({ selectedId, onSelect, onNewTicket }) {
  const { tickets } = useTickets();
  const [filterStatus, setFilterStatus] = useState('all');
  const [filterPriority, setFilterPriority] = useState('all');
  const [search, setSearch] = useState('');
  const listRef = useRef(null);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return tickets.filter((t) => {
      const statusOk = filterStatus === 'all' || t.status === filterStatus;
      const priorityOk = filterPriority === 'all' || t.priority === filterPriority;
      const searchOk = !q ||
        t.subject.toLowerCase().includes(q) ||
        t.customerEmail.toLowerCase().includes(q);
      return statusOk && priorityOk && searchOk;
    });
  }, [tickets, filterStatus, filterPriority, search]);

  // Keyboard navigation: ArrowUp/Down moves through the filtered list
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

    // Move DOM focus to the newly selected card
    const card = listRef.current?.querySelector(`#ticket-${nextId}`);
    card?.focus();
  }, [filtered, selectedId, onSelect]);

  return (
    <aside className="sidebar" aria-label="Ticket list">
      {/* Logo / header */}
      <div className="sidebar-header">
        <div className="sidebar-logo">
          <div className="sidebar-logo-mark" aria-hidden="true">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <path
                d="M2 4a2 2 0 012-2h8a2 2 0 012 2v6a2 2 0 01-2 2H9l-3 2.5V12H4a2 2 0 01-2-2V4z"
                fill="#fff"
                fillOpacity="0.9"
              />
            </svg>
          </div>
          <div>
            <div className="sidebar-logo-text">SupportDesk</div>
            <div className="sidebar-logo-sub">Ticket Management</div>
          </div>
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

      {/* Search + Filters */}
      <div className="sidebar-filters" role="search" aria-label="Search and filter tickets">
        {/* Search */}
        <div className="search-row">
          <label htmlFor="ticket-search" className="visually-hidden">Search tickets</label>
          <div className="search-input-wrap">
            <svg className="search-icon" width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
              <circle cx="5" cy="5" r="3.5" stroke="currentColor" strokeWidth="1.4" />
              <path d="M8 8l2.5 2.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
            </svg>
            <input
              id="ticket-search"
              type="search"
              className="search-input"
              placeholder="Search subject or email…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              autoComplete="off"
              spellCheck={false}
            />
            {search && (
              <button
                className="search-clear"
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
        </div>

        {/* Status + Priority */}
        <div className="filter-row">
          <label htmlFor="filter-status" className="visually-hidden">Filter by status</label>
          <select
            id="filter-status"
            className="filter-select"
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
            className="filter-select"
            value={filterPriority}
            onChange={(e) => setFilterPriority(e.target.value)}
          >
            <option value="all">All Priorities</option>
            <option value="urgent">Urgent</option>
            <option value="high">High</option>
            <option value="medium">Medium</option>
            <option value="low">Low</option>
          </select>
        </div>
      </div>

      {/* Stats */}
      <SidebarStats tickets={tickets} />

      {/* List */}
      <div
        ref={listRef}
        className="ticket-list"
        role="listbox"
        aria-label="Tickets"
        aria-activedescendant={selectedId ? `ticket-${selectedId}` : undefined}
        onKeyDown={handleListKeyDown}
      >
        {filtered.length === 0 ? (
          <div className="ticket-list-empty" role="status">
            <svg width="36" height="36" viewBox="0 0 36 36" fill="none" aria-hidden="true">
              <rect x="4" y="6" width="28" height="24" rx="4" stroke="#7f8ba4" strokeWidth="1.5" />
              <path d="M10 13h16M10 18h10M10 23h7" stroke="#7f8ba4" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
            <span>No tickets match your filters</span>
          </div>
        ) : (
          filtered.map((ticket) => (
            <TicketCard
              key={ticket.id}
              ticket={ticket}
              isActive={ticket.id === selectedId}
              onClick={() => onSelect(ticket.id)}
            />
          ))
        )}
      </div>
    </aside>
  );
}

/* ── ticket card ─────────────────────────────────────────── */
function TicketCard({ ticket, isActive, onClick }) {
  return (
    <div
      id={`ticket-${ticket.id}`}
      className={`ticket-card${isActive ? ' active' : ''}`}
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
      <div className="ticket-card-top">
        <span className="ticket-card-id">{ticket.id}</span>
        <div className="ticket-card-badges">
          <PriorityBadge priority={ticket.priority} />
          <StatusBadge status={ticket.status} />
        </div>
      </div>

      <div className="ticket-card-subject">{ticket.subject}</div>

      <div className="ticket-card-meta">
        <span className="ticket-card-email" title={ticket.customerEmail}>
          {ticket.customerEmail}
        </span>
        <span className="ticket-card-date">{formatDate(ticket.createdAt)}</span>
      </div>
    </div>
  );
}
