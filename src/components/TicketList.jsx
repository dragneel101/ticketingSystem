import { useState, useMemo, useRef, useCallback, useEffect } from 'react';
import { useTickets } from '../context/TicketContext';
import { useAuth } from '../context/AuthContext';
import SlaCountdown from './SlaCountdown';
import { STATUS_LABELS, STATUS_OPTIONS, TERMINAL_STATUSES } from '../utils/statusConfig';
import { useBoards } from '../context/BoardContext';

/* ── helpers ─────────────────────────────────────────────── */
const PRIORITY_ORDER = { urgent: 3, high: 2, medium: 1, low: 0 };

function ticketRefNum(id) {
  const m = id?.match(/\d+$/);
  return m ? parseInt(m[0], 10) : 0;
}

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
      {STATUS_LABELS[status] ?? status}
    </span>
  );
}

/* ── stat counts ─────────────────────────────────────────── */
function TicketStats({ tickets }) {
  const counts = useMemo(() => {
    let active = 0, pending = 0, resolved = 0, closed = 0;
    for (const t of tickets) {
      if (t.status === 'resolved') resolved++;
      else if (t.status === 'closed') closed++;
      else if (t.status === 'pending-client' || t.status === 'pending-vendor' ||
               t.status === 'requesting-escalation' || t.status === 'pending') pending++;
      else active++;
    }
    return { active, pending, resolved, closed };
  }, [tickets]);

  const stats = [
    { label: 'Active',   value: counts.active,   color: 'var(--s-in-progress-dot)' },
    { label: 'Pending',  value: counts.pending,  color: 'var(--s-pending-client-dot)' },
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

/* ── sortable column header button ──────────────────────── */
function ColHeader({ label, colKey, sortKey, sortDir, onSort }) {
  const active = sortKey === colKey;
  return (
    <button
      className={`tl-col-btn${active ? ' tl-col-btn--active' : ''}`}
      onClick={() => onSort(colKey)}
      aria-sort={active ? (sortDir === 'asc' ? 'ascending' : 'descending') : 'none'}
    >
      {label}
      <svg className="tl-sort-icon" width="8" height="10" viewBox="0 0 8 10" fill="none" aria-hidden="true">
        <path
          d="M4 1L1.5 4h5L4 1z"
          fill={active && sortDir === 'asc' ? 'currentColor' : 'var(--gray-400)'}
        />
        <path
          d="M4 9L1.5 6h5L4 9z"
          fill={active && sortDir === 'desc' ? 'currentColor' : 'var(--gray-400)'}
        />
      </svg>
    </button>
  );
}

/* ── main component ──────────────────────────────────────── */
export default function TicketList({ selectedId, onSelect, onNewTicket }) {
  const { tickets, meta, loadMoreTickets } = useTickets();
  const { user } = useAuth();
  const { boards } = useBoards();
  const [filterStatus, setFilterStatus] = useState('all');
  const [loadingMore, setLoadingMore] = useState(false);
  const [filterPriority, setFilterPriority] = useState('all');
  const [filterBoard, setFilterBoard] = useState('all');
  const [sortKey, setSortKey] = useState(null);
  const [sortDir, setSortDir] = useState('asc');
  const [filterAssignee, setFilterAssignee] = useState('all');
  const [agents, setAgents] = useState([]);
  const [search, setSearch] = useState('');
  const listRef = useRef(null);

  function handleSort(key) {
    if (sortKey === key) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDir('asc');
    }
  }

  useEffect(() => {
    fetch('/api/auth/agents')
      .then((r) => r.ok ? r.json() : Promise.reject())
      .then(setAgents)
      .catch(() => {});
  }, []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const result = tickets.filter((t) => {
      const statusOk = filterStatus === 'all' || t.status === filterStatus;
      const priorityOk = filterPriority === 'all' || t.priority === filterPriority;
      const boardOk = filterBoard === 'all'
        ? true
        : filterBoard === 'none'
          ? (t.boardId === null || t.boardId === undefined)
          : t.boardId === parseInt(filterBoard, 10);
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

      return statusOk && priorityOk && boardOk && searchOk && assigneeOk;
    });

    if (sortKey) {
      result.sort((a, b) => {
        let aVal, bVal;
        if (sortKey === 'id') {
          aVal = ticketRefNum(a.id);
          bVal = ticketRefNum(b.id);
        } else if (sortKey === 'priority') {
          aVal = PRIORITY_ORDER[a.priority] ?? 0;
          bVal = PRIORITY_ORDER[b.priority] ?? 0;
        } else if (sortKey === 'createdAt') {
          aVal = new Date(a.createdAt).getTime();
          bVal = new Date(b.createdAt).getTime();
        } else if (sortKey === 'resolutionDueAt') {
          aVal = a.resolutionDueAt ? new Date(a.resolutionDueAt).getTime() : Infinity;
          bVal = b.resolutionDueAt ? new Date(b.resolutionDueAt).getTime() : Infinity;
        } else {
          aVal = (a[sortKey] || '').toLowerCase();
          bVal = (b[sortKey] || '').toLowerCase();
        }
        if (aVal < bVal) return sortDir === 'asc' ? -1 : 1;
        if (aVal > bVal) return sortDir === 'asc' ? 1 : -1;
        return 0;
      });
    }

    return result;
  }, [tickets, filterStatus, filterPriority, filterBoard, filterAssignee, search, user?.id, sortKey, sortDir]);

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
    filterBoard !== 'all' ||
    filterAssignee !== 'all' ||
    search.trim() !== '';

  function clearFilters() {
    setFilterStatus('all');
    setFilterPriority('all');
    setFilterBoard('all');
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
            {STATUS_OPTIONS.map(({ value, label }) => (
              <option key={value} value={value}>{label}</option>
            ))}
            {/* Legacy statuses — shown only if a ticket with that status exists */}
            <option value="open">Open (legacy)</option>
            <option value="pending">Pending (legacy)</option>
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

          <label htmlFor="filter-board" className="visually-hidden">Filter by board</label>
          <select
            id="filter-board"
            className="tl-select"
            value={filterBoard}
            onChange={(e) => setFilterBoard(e.target.value)}
          >
            <option value="all">All Boards</option>
            <option value="none">No Board</option>
            {boards.map((b) => (
              <option key={b.id} value={b.id}>{b.name}</option>
            ))}
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
        <div className="tl-col-header">
          <ColHeader label="Ref" colKey="id" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} />
          <ColHeader label="Subject" colKey="subject" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} />
          <ColHeader label="Customer" colKey="customerName" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} />
          <ColHeader label="Assignee" colKey="assigneeName" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} />
          <ColHeader label="Priority / Status" colKey="priority" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} />
          <ColHeader label="Created" colKey="createdAt" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} />
          <ColHeader label="Board" colKey="boardName" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} />
          <ColHeader label="SLA" colKey="resolutionDueAt" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} />
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
  const now = Date.now();
  const isBreached =
    (ticket.resolutionDueAt    && new Date(ticket.resolutionDueAt).getTime()    < now) ||
    (ticket.firstResponseDueAt && new Date(ticket.firstResponseDueAt).getTime() < now);

  return (
    <div
      id={`ticket-${ticket.id}`}
      className={`tl-row${isActive ? ' tl-row--active' : ''}${isBreached ? ' tl-row--sla-breached' : ''}`}
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

      {/* Board */}
      <span className="tl-row-board">
        {ticket.boardName ? (
          <span className="tl-board-badge">{ticket.boardName}</span>
        ) : (
          <span className="tl-row-unassigned">—</span>
        )}
      </span>

      {/* SLA countdown */}
      <span className="tl-row-sla">
        <SlaCountdown dueAt={ticket.resolutionDueAt} compact />
      </span>

      {/* Arrow cue */}
      <svg className="tl-row-arrow" width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
        <path d="M5 3l4 4-4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </div>
  );
}
