import { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import { useTickets } from '../context/TicketContext';
import { useAuth } from '../context/AuthContext';
import SlaCountdown from './SlaCountdown';
import { STATUS_LABELS, STATUS_OPTIONS } from '../utils/statusConfig';
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
      else if (
        t.status === 'pending-client' || t.status === 'pending-vendor' ||
        t.status === 'requesting-escalation' || t.status === 'pending'
      ) pending++;
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

/* ── column definitions ──────────────────────────────────── */
const DEFAULT_COLUMNS = [
  'id', 'subject', 'customerName', 'status', 'priority',
  'assigneeName', 'boardName', 'createdAt', 'resolutionDueAt',
];

const COLUMN_META = {
  id:              { label: 'Ref',      width: '90px'  },
  subject:         { label: 'Subject',  width: '1fr'   },
  customerName:    { label: 'Customer', width: '140px' },
  status:          { label: 'Status',   width: '140px' },
  priority:        { label: 'Priority', width: '90px'  },
  assigneeName:    { label: 'Assignee', width: '130px' },
  boardName:       { label: 'Board',    width: '110px' },
  createdAt:       { label: 'Created',  width: '90px'  },
  resolutionDueAt: { label: 'SLA',      width: '110px' },
};

/* ── sort comparators ────────────────────────────────────── */
function compareTickets(a, b, key, dir) {
  let av, bv;
  switch (key) {
    case 'id':
      av = ticketRefNum(a.id); bv = ticketRefNum(b.id);
      return dir === 'asc' ? av - bv : bv - av;
    case 'priority':
      av = PRIORITY_ORDER[a.priority] ?? -1;
      bv = PRIORITY_ORDER[b.priority] ?? -1;
      return dir === 'asc' ? av - bv : bv - av;
    case 'createdAt':
    case 'resolutionDueAt': {
      const ad = a[key] ? new Date(a[key]).getTime() : (dir === 'asc' ? Infinity : -Infinity);
      const bd = b[key] ? new Date(b[key]).getTime() : (dir === 'asc' ? Infinity : -Infinity);
      return dir === 'asc' ? ad - bd : bd - ad;
    }
    default:
      av = (a[key] ?? '').toString().toLowerCase();
      bv = (b[key] ?? '').toString().toLowerCase();
      const cmp = av.localeCompare(bv);
      return dir === 'asc' ? cmp : -cmp;
  }
}

/* ── sort chevron icons ──────────────────────────────────── */
function SortIcons({ colKey, sortKey, sortDir }) {
  const isActive = colKey === sortKey;
  const upActive   = isActive && sortDir === 'asc';
  const downActive = isActive && sortDir === 'desc';

  return (
    <span className="tl-th-sort-icons" aria-hidden="true">
      <svg
        className={`tl-th-chevron ${upActive ? 'tl-th-chevron--active' : ''}`}
        width="8" height="5" viewBox="0 0 8 5" fill="none"
      >
        <path d="M1 4l3-3 3 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
      </svg>
      <svg
        className={`tl-th-chevron ${downActive ? 'tl-th-chevron--active' : ''}`}
        width="8" height="5" viewBox="0 0 8 5" fill="none"
      >
        <path d="M1 1l3 3 3-3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
      </svg>
    </span>
  );
}

/* ── main component ──────────────────────────────────────── */
export default function TicketList({ selectedId, onSelect, onNewTicket }) {
  const { tickets, meta, loadMoreTickets } = useTickets();
  const { user } = useAuth();
  const { boards } = useBoards();
  const [loadingMore, setLoadingMore] = useState(false);

  /* filters */
  const [filterPriority, setFilterPriority] = useState('all');
  const [filterStatus,   setFilterStatus]   = useState('all');
  const [filterBoard,    setFilterBoard]    = useState('all');
  const [filterAssignee, setFilterAssignee] = useState('all');
  const [search,         setSearch]         = useState('');
  const [agents,         setAgents]         = useState([]);

  /* table state */
  const [colOrder, setColOrder]     = useState(DEFAULT_COLUMNS);
  const [dragCol,  setDragCol]      = useState(null);
  const [dragOver, setDragOver]     = useState(null);
  const [sortKey,  setSortKey]      = useState('id');
  const [sortDir,  setSortDir]      = useState('asc');

  const tableRef = useRef(null);

  useEffect(() => {
    fetch('/api/auth/agents')
      .then((r) => r.ok ? r.json() : Promise.reject())
      .then(setAgents)
      .catch(() => {});
  }, []);

  /* ── filter ── */
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return tickets.filter((t) => {
      const priorityOk = filterPriority === 'all' || t.priority === filterPriority;
      const statusOk   = filterStatus   === 'all' || t.status   === filterStatus;
      const boardOk    = filterBoard    === 'all'
        ? true
        : filterBoard === 'none'
          ? (t.boardId === null || t.boardId === undefined)
          : t.boardId === parseInt(filterBoard, 10);
      const searchOk   = !q ||
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

      return priorityOk && statusOk && boardOk && searchOk && assigneeOk;
    });
  }, [tickets, filterPriority, filterStatus, filterBoard, filterAssignee, search, user?.id]);

  /* ── sort ── */
  const sorted = useMemo(() => {
    const arr = [...filtered];
    arr.sort((a, b) => compareTickets(a, b, sortKey, sortDir));
    return arr;
  }, [filtered, sortKey, sortDir]);

  /* ── column sort click ── */
  function handleColSort(key) {
    if (sortKey !== key) {
      setSortKey(key);
      setSortDir('asc');
    } else if (sortDir === 'asc') {
      setSortDir('desc');
    } else {
      // Third click: clear sort back to default (ref asc)
      setSortKey('id');
      setSortDir('asc');
    }
  }

  /* ── drag-to-reorder ── */
  const handleDragStart = useCallback((key) => {
    setDragCol(key);
  }, []);

  const handleDragOver = useCallback((e, key) => {
    e.preventDefault();
    if (key !== dragCol) setDragOver(key);
  }, [dragCol]);

  const handleDrop = useCallback((e, targetKey) => {
    e.preventDefault();
    if (!dragCol || dragCol === targetKey) return;
    setColOrder((prev) => {
      const arr = [...prev];
      const fromIdx = arr.indexOf(dragCol);
      const toIdx   = arr.indexOf(targetKey);
      arr.splice(fromIdx, 1);
      arr.splice(toIdx, 0, dragCol);
      return arr;
    });
    setDragCol(null);
    setDragOver(null);
  }, [dragCol]);

  const handleDragEnd = useCallback(() => {
    setDragCol(null);
    setDragOver(null);
  }, []);

  /* ── keyboard navigation ── */
  const handleTableKeyDown = useCallback((e) => {
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
    e.preventDefault();
    const currentIdx = sorted.findIndex((t) => t.id === selectedId);
    let nextIdx;
    if (currentIdx === -1) {
      nextIdx = e.key === 'ArrowDown' ? 0 : sorted.length - 1;
    } else {
      nextIdx = e.key === 'ArrowDown'
        ? Math.min(currentIdx + 1, sorted.length - 1)
        : Math.max(currentIdx - 1, 0);
    }
    if (sorted[nextIdx]) {
      onSelect(sorted[nextIdx].id);
      // scroll selected row into view
      const row = tableRef.current?.querySelector(`[data-ticket-id="${sorted[nextIdx].id}"]`);
      row?.scrollIntoView({ block: 'nearest' });
    }
  }, [sorted, selectedId, onSelect]);

  /* ── filters state ── */
  const hasActiveFilters =
    filterPriority !== 'all' ||
    filterStatus   !== 'all' ||
    filterBoard    !== 'all' ||
    filterAssignee !== 'all' ||
    search.trim() !== '';

  function clearFilters() {
    setFilterPriority('all');
    setFilterStatus('all');
    setFilterBoard('all');
    setFilterAssignee('all');
    setSearch('');
  }

  /* ── load more ── */
  async function handleLoadMore() {
    setLoadingMore(true);
    try {
      await loadMoreTickets();
    } finally {
      setLoadingMore(false);
    }
  }

  /* ── cell renderers ── */
  function renderCell(ticket, key) {
    switch (key) {
      case 'id':
        return (
          <span className="tl-td-ref">{ticket.id}</span>
        );
      case 'subject':
        return (
          <span className="tl-td-subject" title={ticket.subject}>{ticket.subject}</span>
        );
      case 'customerName':
        return (
          <span className="tl-td-customer" title={`${ticket.customerName ?? ''} · ${ticket.customerEmail}`}>
            {ticket.customerName ?? ticket.customerEmail}
          </span>
        );
      case 'status':
        return <StatusBadge status={ticket.status} />;
      case 'priority':
        return <PriorityBadge priority={ticket.priority} />;
      case 'assigneeName':
        return ticket.assignedTo ? (
          <span className="tl-td-assignee">
            <span className="tl-td-avatar" aria-label={`Assigned to ${ticket.assigneeName}`}>
              {initials(ticket.assigneeName)}
            </span>
            <span className="tl-td-assignee-name" title={ticket.assigneeName}>
              {ticket.assigneeName}
            </span>
          </span>
        ) : (
          <span className="tl-td-unassigned">—</span>
        );
      case 'boardName':
        return ticket.boardName ? (
          <span className="tl-board-badge">{ticket.boardName}</span>
        ) : (
          <span className="tl-td-dash">—</span>
        );
      case 'createdAt':
        return (
          <span className="tl-td-date" title={new Date(ticket.createdAt).toLocaleString()}>
            {formatDate(ticket.createdAt)}
          </span>
        );
      case 'resolutionDueAt': {
        const dueAt = ticket.resolutionDueAt ?? ticket.firstResponseDueAt ?? null;
        return dueAt
          ? <SlaCountdown dueAt={dueAt} compact />
          : <span className="tl-td-dash">—</span>;
      }
      default:
        return null;
    }
  }

  /* ── SLA breach check ── */
  function isBreached(ticket) {
    const now = Date.now();
    return (
      (ticket.resolutionDueAt    && new Date(ticket.resolutionDueAt).getTime()    < now) ||
      (ticket.firstResponseDueAt && new Date(ticket.firstResponseDueAt).getTime() < now)
    );
  }

  /* ── column template string for <colgroup> ── */
  const colWidths = colOrder.map((k) => COLUMN_META[k]?.width ?? '100px');

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

      {/* ── Toolbar ── */}
      <div className="tl-toolbar" role="search" aria-label="Search and filter tickets">
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

        <div className="tl-filters">
          <label htmlFor="filter-status" className="visually-hidden">Filter by status</label>
          <select
            id="filter-status"
            className="tl-select"
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
          >
            <option value="all">All Statuses</option>
            {STATUS_OPTIONS.map((s) => (
              <option key={s.value} value={s.value}>{s.label}</option>
            ))}
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
              <option key={a.id} value={a.id}>{a.name}</option>
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

      {/* ── Table ── */}
      <div
        className="tl-table-wrap"
        ref={tableRef}
        onKeyDown={handleTableKeyDown}
        role="grid"
        aria-label="Tickets table"
        aria-rowcount={sorted.length}
      >
        <table className="tl-table" aria-label="Tickets">
          <colgroup>
            {colOrder.map((key) => (
              <col
                key={key}
                style={{ width: COLUMN_META[key]?.width === '1fr' ? undefined : COLUMN_META[key]?.width }}
              />
            ))}
          </colgroup>

          <thead className="tl-thead">
            <tr>
              {colOrder.map((key) => {
                const isDragging  = dragCol  === key;
                const isDragOver  = dragOver === key;
                const isActivSort = sortKey  === key;

                return (
                  <th
                    key={key}
                    className={[
                      'tl-th',
                      isDragging ? 'tl-th--dragging'  : '',
                      isDragOver ? 'tl-th--drag-over' : '',
                      isActivSort ? 'tl-th--sorted'   : '',
                    ].filter(Boolean).join(' ')}
                    draggable
                    onDragStart={() => handleDragStart(key)}
                    onDragOver={(e) => handleDragOver(e, key)}
                    onDrop={(e) => handleDrop(e, key)}
                    onDragEnd={handleDragEnd}
                    onClick={() => handleColSort(key)}
                    aria-sort={
                      sortKey === key
                        ? sortDir === 'asc' ? 'ascending' : 'descending'
                        : 'none'
                    }
                    title={`Sort by ${COLUMN_META[key].label} — drag to reorder`}
                  >
                    <span className="tl-th-inner">
                      <span className="tl-th-label">{COLUMN_META[key].label}</span>
                      <SortIcons colKey={key} sortKey={sortKey} sortDir={sortDir} />
                    </span>
                  </th>
                );
              })}
            </tr>
          </thead>

          <tbody>
            {sorted.length === 0 ? (
              <tr>
                <td colSpan={colOrder.length} className="tl-td-empty">
                  {hasActiveFilters
                    ? 'No tickets match your filters.'
                    : 'No tickets yet.'}
                </td>
              </tr>
            ) : (
              sorted.map((ticket, rowIdx) => {
                const isActive   = ticket.id === selectedId;
                const breached   = isBreached(ticket);
                const isEven     = rowIdx % 2 === 1;

                return (
                  <tr
                    key={ticket.id}
                    data-ticket-id={ticket.id}
                    className={[
                      'tl-tr',
                      isEven   ? 'tl-tr--even'    : '',
                      isActive ? 'tl-tr--active'  : '',
                      breached && !isActive ? 'tl-tr--breached' : '',
                    ].filter(Boolean).join(' ')}
                    onClick={() => onSelect(ticket.id)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        onSelect(ticket.id);
                      }
                    }}
                    role="row"
                    aria-selected={isActive}
                    tabIndex={0}
                  >
                    {colOrder.map((key, colIdx) => (
                      <td
                        key={key}
                        className={[
                          'tl-td',
                          `tl-td--${key}`,
                          colIdx === 0 && isActive  ? 'tl-td--first-active'  : '',
                          colIdx === 0 && breached && !isActive ? 'tl-td--first-breached' : '',
                        ].filter(Boolean).join(' ')}
                      >
                        {renderCell(ticket, key)}
                      </td>
                    ))}
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
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
