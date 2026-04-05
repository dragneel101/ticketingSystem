import { useState, useRef, useEffect, useCallback } from 'react';
import { useTickets } from '../context/TicketContext';
import { useToast } from '../context/ToastContext';
import { useAuth } from '../context/AuthContext';
import SlaCountdown from './SlaCountdown';
import { STATUS_OPTIONS, STATUS_LABELS, TERMINAL_STATUSES } from '../utils/statusConfig';
import { useBoards } from '../context/BoardContext';


// ── helpers ────────────────────────────────────────────────────

function initials(name) {
  if (!name) return '?';
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].charAt(0).toUpperCase();
  return (parts[0].charAt(0) + parts[parts.length - 1].charAt(0)).toUpperCase();
}

function formatTime(iso) {
  return new Date(iso).toLocaleString([], {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatDate(iso) {
  return new Date(iso).toLocaleString([], {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

// Pure utility — no side effects, easy to unit-test in isolation.
// Returns a human-readable relative time string for audit trail timestamps.
function formatRelativeTime(iso) {
  const diffMs = Date.now() - new Date(iso).getTime();
  const diffSec = Math.floor(diffMs / 1000);
  const diffMin = Math.floor(diffSec / 60);
  const diffHour = Math.floor(diffMin / 60);

  if (diffSec < 60)  return 'just now';
  if (diffMin < 60)  return `${diffMin} minute${diffMin === 1 ? '' : 's'} ago`;
  if (diffHour < 24) return `${diffHour} hour${diffHour === 1 ? '' : 's'} ago`;

  // Older than 24h — show an absolute date that stays readable across days/years
  return new Date(iso).toLocaleDateString([], {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

// ── sub-components ─────────────────────────────────────────────

const PRIORITY_OPTIONS = ['low', 'medium', 'high', 'urgent'];

function ControlSelect({ id, label, value, options, onChange, disabled }) {
  // options can be strings (priority) or {value, label} objects (status)
  const normalised = options.map((o) =>
    typeof o === 'string'
      ? { value: o, label: o.charAt(0).toUpperCase() + o.slice(1) }
      : o
  );
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      <label
        htmlFor={id}
        style={{
          fontSize: '10px',
          fontWeight: 600,
          textTransform: 'uppercase',
          letterSpacing: '0.5px',
          color: 'var(--gray-400)',
        }}
      >
        {label}
      </label>
      <select
        id={id}
        className="detail-select"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-label={label}
        disabled={disabled}
      >
        {normalised.map(({ value: v, label: l }) => (
          <option key={v} value={v}>{l}</option>
        ))}
      </select>
    </div>
  );
}

function AssigneeSelect({ id, agents, assignedTo, onChange, disabled }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      <label
        htmlFor={id}
        style={{
          fontSize: '10px',
          fontWeight: 600,
          textTransform: 'uppercase',
          letterSpacing: '0.5px',
          color: 'var(--gray-400)',
        }}
      >
        Assigned to
      </label>
      <select
        id={id}
        className="detail-select detail-select--assignee"
        value={assignedTo ?? ''}
        onChange={(e) => onChange(e.target.value === '' ? null : parseInt(e.target.value, 10))}
        aria-label="Assigned to"
        disabled={disabled}
      >
        <option value="">Unassigned</option>
        {agents.map((a) => (
          <option key={a.id} value={a.id}>
            {a.name} ({a.role})
          </option>
        ))}
      </select>
    </div>
  );
}

// A single customer-facing or support reply bubble.
// customerEmail is the ticket's customer so we can tell which side each message is on.
function MessageBubble({ message, customerEmail }) {
  const isSupport = message.from !== customerEmail;
  const side = isSupport ? 'support' : 'customer';
  return (
    <div className={`message-group ${side}`}>
      <span className="message-sender">{message.from}</span>
      <div className="message-bubble" role="article">{message.text}</div>
      <time className="message-time" dateTime={message.time}>{formatTime(message.time)}</time>
    </div>
  );
}

// An internal-note bubble — amber tint distinguishes it from customer messages.
function NoteBubble({ message }) {
  return (
    <div className="note-group">
      <span className="note-sender">{message.from}</span>
      <div className="note-bubble" role="article">{message.text}</div>
      <time className="message-time" dateTime={message.time}>{formatTime(message.time)}</time>
    </div>
  );
}

// ── Communication tab ──────────────────────────────────────────
function CommunicationTab({ ticket, ticketId }) {
  const { addMessage } = useTickets();
  const { addToast } = useToast();
  const { user } = useAuth();
  const agentEmail = user?.email ?? 'support';
  const [replyText, setReplyText] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [justSent, setJustSent] = useState(false);
  const [notifyCustomer, setNotifyCustomer] = useState(true);
  const threadRef = useRef(null);
  const textareaRef = useRef(null);

  // Filter to only customer/support messages — excludes internal notes.
  const messages = (ticket.messages || []).filter((m) => m.type !== 'note');

  // Scroll to bottom when new messages arrive.
  useEffect(() => {
    if (threadRef.current) {
      threadRef.current.scrollTop = threadRef.current.scrollHeight;
    }
  }, [messages.length]);

  const handleSend = useCallback(async () => {
    const text = replyText.trim();
    if (!text || isSending) return;
    setIsSending(true);
    try {
      await addMessage(ticketId, { from: agentEmail, text, type: 'message', notify_customer: notifyCustomer });
      setReplyText('');
      setJustSent(true);
      addToast('Reply sent', 'success');
      setTimeout(() => setJustSent(false), 2000);
      requestAnimationFrame(() => textareaRef.current?.focus());
    } catch {
      addToast('Failed to send reply', 'error');
    } finally {
      setIsSending(false);
    }
  }, [replyText, isSending, ticketId, addMessage, addToast]);

  function handleKeyDown(e) {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      e.preventDefault();
      handleSend();
    }
  }

  const canSend = replyText.trim().length > 0 && !isSending;

  return (
    <div className="tp-tab-content">
      <div
        className="message-thread tp-thread"
        ref={threadRef}
        role="log"
        aria-live="polite"
        aria-label="Message thread"
      >
        {messages.length === 0 ? (
          <div className="tp-thread-empty">
            <svg width="36" height="36" viewBox="0 0 36 36" fill="none" aria-hidden="true">
              <path
                d="M6 9a3 3 0 013-3h18a3 3 0 013 3v12a3 3 0 01-3 3h-7l-5 4.5V24H9a3 3 0 01-3-3V9z"
                stroke="#cdd3de"
                strokeWidth="1.5"
              />
            </svg>
            <span>No messages yet — start the conversation below</span>
          </div>
        ) : (
          messages.map((msg, i) => (
            <MessageBubble key={`${msg.time}-${i}`} message={msg} customerEmail={ticket.customerEmail} />
          ))
        )}
      </div>

      <div className="reply-box" role="complementary" aria-label="Reply">
        <div className="reply-box-inner">
          <textarea
            ref={textareaRef}
            className="reply-textarea"
            placeholder="Type your reply… (Ctrl+Enter to send)"
            value={replyText}
            onChange={(e) => setReplyText(e.target.value)}
            onKeyDown={handleKeyDown}
            rows={3}
            aria-label="Reply message"
            disabled={isSending}
          />
          <div className="reply-notify-row">
            <label className="reply-notify-toggle" title={notifyCustomer ? 'Customer will be notified by email' : 'Customer will NOT be notified'}>
              <input
                type="checkbox"
                checked={notifyCustomer}
                onChange={e => setNotifyCustomer(e.target.checked)}
              />
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path d="M22 2L11 13" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                <path d="M22 2L15 22L11 13L2 9L22 2Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
              {notifyCustomer ? 'Email notification will be sent to client' : 'No email notification to client'}
            </label>
          </div>
          <div className="reply-footer">
            <span className="reply-sender-label">
              <svg width="11" height="11" viewBox="0 0 12 12" fill="none" aria-hidden="true">
                <circle cx="6" cy="4" r="2.5" stroke="currentColor" strokeWidth="1.2" />
                <path d="M1.5 10.5c0-2.485 2.015-4.5 4.5-4.5s4.5 2.015 4.5 4.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
              </svg>
              Replying as <strong>{agentEmail}</strong>
            </span>
            <button
              className="btn-send"
              onClick={handleSend}
              disabled={!canSend}
              aria-label={isSending ? 'Sending…' : 'Send reply'}
            >
              {justSent ? (
                <>
                  <svg width="13" height="13" viewBox="0 0 13 13" fill="none" aria-hidden="true">
                    <path d="M2 7l3.5 3.5L11 3" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                  Sent
                </>
              ) : (
                <>
                  <svg width="13" height="13" viewBox="0 0 13 13" fill="none" aria-hidden="true">
                    <path d="M1.5 6.5L11.5 1.5L7 11.5L5.5 7L1.5 6.5z" stroke="#fff" strokeWidth="1.5" strokeLinejoin="round" />
                  </svg>
                  {isSending ? 'Sending…' : 'Send Reply'}
                </>
              )}
            </button>
          </div>
        </div>
        <p style={{ fontSize: 11, color: 'var(--gray-400)', marginTop: 8, textAlign: 'right' }}>
          Ctrl+Enter to send quickly
        </p>
      </div>
    </div>
  );
}

// ── Internal Notes tab ─────────────────────────────────────────
function InternalNotesTab({ ticket, ticketId }) {
  const { addMessage } = useTickets();
  const { addToast } = useToast();
  const { user } = useAuth();
  const [noteText, setNoteText] = useState('');
  const [isSending, setIsSending] = useState(false);
  const threadRef = useRef(null);

  // Filter to only internal notes.
  const notes = (ticket.messages || []).filter((m) => m.type === 'note');

  useEffect(() => {
    if (threadRef.current) {
      threadRef.current.scrollTop = threadRef.current.scrollHeight;
    }
  }, [notes.length]);

  async function handlePostNote() {
    const text = noteText.trim();
    if (!text || isSending) return;
    setIsSending(true);
    try {
      // The note is attributed to the current agent's email so it's
      // identifiable in the thread. Internal notes never reach the customer.
      await addMessage(ticketId, { from: user.email, text, type: 'note' });
      setNoteText('');
      addToast('Note added', 'success');
    } catch {
      addToast('Failed to add note', 'error');
    } finally {
      setIsSending(false);
    }
  }

  function handleKeyDown(e) {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      e.preventDefault();
      handlePostNote();
    }
  }

  return (
    <div className="tp-tab-content">
      <div className="tp-notes-thread" ref={threadRef} role="log" aria-live="polite" aria-label="Internal notes">
        {notes.length === 0 ? (
          <div className="tp-thread-empty">
            <svg width="36" height="36" viewBox="0 0 36 36" fill="none" aria-hidden="true">
              <rect x="6" y="5" width="24" height="26" rx="3" stroke="#cdd3de" strokeWidth="1.5" />
              <path d="M12 13h12M12 19h8M12 25h6" stroke="#cdd3de" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
            <span>No internal notes yet</span>
          </div>
        ) : (
          notes.map((note, i) => (
            <NoteBubble key={`${note.time}-${i}`} message={note} />
          ))
        )}
      </div>

      <div className="tp-note-composer">
        <div className="tp-note-composer-inner">
          <textarea
            className="tp-note-textarea"
            placeholder="Add an internal note… (Ctrl+Enter to post)"
            value={noteText}
            onChange={(e) => setNoteText(e.target.value)}
            onKeyDown={handleKeyDown}
            rows={3}
            aria-label="Internal note"
            disabled={isSending}
          />
          <div className="reply-footer">
            <span className="reply-sender-label" style={{ color: 'var(--note-text, #92640a)' }}>
              <svg width="11" height="11" viewBox="0 0 12 12" fill="none" aria-hidden="true">
                <rect x="1.5" y="2" width="9" height="8" rx="1.5" stroke="currentColor" strokeWidth="1.2" />
                <path d="M4 5.5h4M4 7.5h2.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
              </svg>
              Internal — not visible to customer
            </span>
            <button
              className="btn-note-post"
              onClick={handlePostNote}
              disabled={!noteText.trim() || isSending}
              aria-label="Post internal note"
            >
              {isSending ? 'Posting…' : 'Post Note'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Resolution tab ─────────────────────────────────────────────
// onUpdate is passed from TicketPage so that saves trigger the post-patch
// loadTicket refresh (needed to show 'resolution_set' event in History tab).
function ResolutionTab({ ticket, ticketId, onUpdate }) {
  const { updateTicket } = useTickets();
  // Use the injected onUpdate if provided, fall back to raw updateTicket.
  // This keeps ResolutionTab usable in isolation (e.g., tests).
  const doUpdate = onUpdate ?? updateTicket;
  const { addToast } = useToast();
  // Local state so we can edit without immediately patching the server.
  const [resolutionText, setResolutionText] = useState(ticket.resolution ?? '');
  const [isSaving, setIsSaving] = useState(false);

  // Keep local text in sync if the ticket reloads (e.g., after a page re-mount).
  useEffect(() => {
    setResolutionText(ticket.resolution ?? '');
  }, [ticket.resolution]);

  async function handleSaveResolution() {
    setIsSaving(true);
    try {
      await doUpdate(ticketId, { resolution: resolutionText.trim() || null });
      addToast('Resolution saved', 'success');
    } catch {
      addToast('Failed to save resolution', 'error');
    } finally {
      setIsSaving(false);
    }
  }

  async function handleMarkResolved() {
    setIsSaving(true);
    try {
      // Save both resolution text and status in a single PATCH.
      // The server's `allowed` list now includes `resolution`, so this works.
      await doUpdate(ticketId, {
        status: 'resolved',
        resolution: resolutionText.trim() || null,
      });
      addToast('Ticket marked as resolved', 'success');
    } catch {
      addToast('Failed to resolve ticket', 'error');
    } finally {
      setIsSaving(false);
    }
  }

  const isAlreadyResolved = TERMINAL_STATUSES.includes(ticket.status);

  return (
    <div className="tp-tab-content tp-resolution-content">
      <div className="tp-resolution-body">
        <label className="tp-resolution-label" htmlFor="resolution-textarea">
          Resolution summary
        </label>
        <p className="tp-resolution-hint">
          Summarise what was done, what the root cause was, and how it was fixed.
          This is stored on the ticket and visible to all agents.
        </p>
        <textarea
          id="resolution-textarea"
          className="tp-resolution-textarea"
          placeholder="Describe the resolution…"
          value={resolutionText}
          onChange={(e) => setResolutionText(e.target.value)}
          rows={8}
          aria-label="Resolution summary"
          disabled={isSaving}
        />
        <div className="tp-resolution-actions">
          <button
            className="btn btn-ghost"
            onClick={handleSaveResolution}
            disabled={isSaving}
          >
            {isSaving ? 'Saving…' : 'Save Notes'}
          </button>
          <button
            className="btn btn-primary"
            onClick={handleMarkResolved}
            disabled={isSaving || isAlreadyResolved}
            title={isAlreadyResolved ? 'Ticket is already resolved or closed' : undefined}
          >
            {isSaving ? 'Saving…' : isAlreadyResolved ? 'Already Resolved' : 'Mark as Resolved'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── History tab ───────────────────────────────────────────────
// Renders the audit trail as a vertical timeline. Each event type gets
// a distinct color so agents can scan the history at a glance.

// Maps event_type → { dot class, label builder }
// The label builder receives the full event object and returns a React node
// with key parts bolded — keeps the human sentence approach called for in the spec.
const EVENT_CONFIG = {
  status_changed: {
    dotClass: 'hist-dot--status',
    label: (e) => (
      <>
        <span className="hist-actor">{e.actorName ?? 'Someone'}</span>
        {' changed status from '}
        <strong>{e.fromValue}</strong>
        {' to '}
        <strong>{e.toValue}</strong>
      </>
    ),
  },
  priority_changed: {
    dotClass: 'hist-dot--priority',
    label: (e) => (
      <>
        <span className="hist-actor">{e.actorName ?? 'Someone'}</span>
        {' changed priority from '}
        <strong>{e.fromValue}</strong>
        {' to '}
        <strong>{e.toValue}</strong>
      </>
    ),
  },
  assigned: {
    dotClass: 'hist-dot--assigned',
    label: (e) => (
      <>
        <span className="hist-actor">{e.actorName ?? 'Someone'}</span>
        {' assigned this ticket to '}
        <strong>{e.toValue}</strong>
      </>
    ),
  },
  unassigned: {
    dotClass: 'hist-dot--unassigned',
    label: (e) => (
      <>
        <span className="hist-actor">{e.actorName ?? 'Someone'}</span>
        {' unassigned '}
        <strong>{e.fromValue ?? 'the previous assignee'}</strong>
      </>
    ),
  },
  resolution_set: {
    dotClass: 'hist-dot--resolution',
    label: (e) => (
      <>
        <span className="hist-actor">{e.actorName ?? 'Someone'}</span>
        {' set the resolution'}
      </>
    ),
  },
  board_changed: {
    dotClass: 'hist-dot--board',
    label: (e) => (
      <>
        <span className="hist-actor">{e.actorName ?? 'Someone'}</span>
        {e.fromValue && e.toValue ? (
          <>{' moved board from '}<strong>{e.fromValue}</strong>{' to '}<strong>{e.toValue}</strong></>
        ) : e.toValue ? (
          <>{' assigned to board '}<strong>{e.toValue}</strong></>
        ) : (
          <>{' removed from board '}<strong>{e.fromValue}</strong></>
        )}
      </>
    ),
  },
};

// Fallback for unknown event types — future-proofs against new event_type values
// being added to the backend before the frontend catches up.
function defaultLabel(e) {
  return (
    <>
      <span className="hist-actor">{e.actorName ?? 'Someone'}</span>
      {` performed ${e.eventType.replace(/_/g, ' ')}`}
    </>
  );
}

// ── Date separator helpers ────────────────────────────────────

// Returns the calendar day string for a timestamp, used as a grouping key.
function calendarDay(ts) {
  const d = new Date(ts);
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

// Formats a timestamp into a human-readable date label:
// "Today", "Yesterday", "Mar 15", or "Mar 15, 2025" (year shown when not current year).
function formatDateSeparator(ts) {
  const now = new Date();
  const d = new Date(ts);
  const todayKey = calendarDay(Date.now());
  const key = calendarDay(ts);
  const yesterdayKey = calendarDay(Date.now() - 86400000);

  if (key === todayKey) return 'Today';
  if (key === yesterdayKey) return 'Yesterday';

  const opts = { month: 'short', day: 'numeric' };
  if (d.getFullYear() !== now.getFullYear()) opts.year = 'numeric';
  return d.toLocaleDateString([], opts);
}

const AF_FILTERS = [
  { id: 'all',      label: 'All' },
  { id: 'message',  label: 'Messages' },
  { id: 'note',     label: 'Notes' },
  { id: 'event',    label: 'Events' },
];

// ── All Activity tab ──────────────────────────────────────────
// Merges messages, notes, and audit events into a single chronological timeline.
// Read-only — agents compose in the Communication and Notes tabs.
function AllActivityTab({ ticket }) {
  const feedRef = useRef(null);
  const [activeFilter, setActiveFilter] = useState('all');
  const [showJumpBtn, setShowJumpBtn] = useState(false);

  // Build a unified, sorted list of activity items.
  // Each item gets a `_kind` discriminator so the renderer knows which
  // visual treatment to apply without re-checking the shape each time.
  const allItems = [
    ...(ticket.messages || []).map((m) => ({
      ...m,
      _kind: m.type === 'note' ? 'note' : 'message',
      _ts: new Date(m.time).getTime(),
    })),
    ...(ticket.events || []).map((e) => ({
      ...e,
      _kind: 'event',
      _ts: new Date(e.createdAt).getTime(),
    })),
  ].sort((a, b) => a._ts - b._ts);

  // Per-filter counts shown in the segment badge.
  const counts = {
    all: allItems.length,
    message: allItems.filter((i) => i._kind === 'message').length,
    note: allItems.filter((i) => i._kind === 'note').length,
    event: allItems.filter((i) => i._kind === 'event').length,
  };

  // Apply active filter.
  const items = activeFilter === 'all'
    ? allItems
    : allItems.filter((i) => i._kind === activeFilter);

  // Scroll to bottom whenever filter changes.
  useEffect(() => {
    if (feedRef.current) {
      feedRef.current.scrollTop = feedRef.current.scrollHeight;
    }
  }, [activeFilter]);

  // Auto-scroll to bottom when new items arrive (same pattern as other tabs).
  useEffect(() => {
    if (feedRef.current) {
      feedRef.current.scrollTop = feedRef.current.scrollHeight;
    }
  }, [allItems.length]);

  // Detect how far the user has scrolled from the bottom to show/hide the jump button.
  function handleScroll(e) {
    const el = e.currentTarget;
    const distFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    setShowJumpBtn(distFromBottom > 100);
  }

  function jumpToLatest() {
    if (feedRef.current) {
      feedRef.current.scrollTo({ top: feedRef.current.scrollHeight, behavior: 'smooth' });
    }
    setShowJumpBtn(false);
  }

  if (allItems.length === 0) {
    return (
      <div className="tp-tab-content">
        <div className="hist-empty">
          <svg width="36" height="36" viewBox="0 0 36 36" fill="none" aria-hidden="true">
            <circle cx="18" cy="18" r="13" stroke="#cdd3de" strokeWidth="1.5" />
            <path d="M10 18h16M18 10v16" stroke="#cdd3de" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
          <span>No activity yet</span>
        </div>
      </div>
    );
  }

  // Build the rendered list with date separators injected between day boundaries.
  // The first item always gets a separator above it.
  const renderedItems = [];
  let lastDayKey = null;

  items.forEach((item, i) => {
    const ts = item._ts;
    const dayKey = calendarDay(ts);

    if (dayKey !== lastDayKey) {
      lastDayKey = dayKey;
      renderedItems.push(
        <div key={`sep-${dayKey}-${i}`} className="af-date-sep" aria-hidden="true">
          <span className="af-date-sep-line" />
          <span className="af-date-sep-label">{formatDateSeparator(ts)}</span>
          <span className="af-date-sep-line" />
        </div>
      );
    }

    if (item._kind === 'message') {
      const isSupport = item.from !== ticket.customerEmail;
      renderedItems.push(
        <div
          key={`msg-${item.time}-${i}`}
          className={`af-message af-message--${isSupport ? 'support' : 'customer'}`}
          role="article"
        >
          <span className="af-msg-sender">
            {isSupport ? (
              <>
                <span className="af-msg-dot af-msg-dot--support" aria-hidden="true" />
                Support
              </>
            ) : (
              <>
                <span className="af-msg-dot af-msg-dot--customer" aria-hidden="true" />
                {item.from}
              </>
            )}
          </span>
          <div className="af-msg-bubble">{item.text}</div>
          <time className="af-msg-time" dateTime={item.time}>{formatTime(item.time)}</time>
        </div>
      );
      return;
    }

    if (item._kind === 'note') {
      renderedItems.push(
        <div key={`note-${item.time}-${i}`} className="af-note" role="article">
          <div className="af-note-header">
            <svg className="af-note-icon" width="11" height="11" viewBox="0 0 12 12" fill="none" aria-hidden="true">
              <rect x="2" y="5" width="8" height="6" rx="1.5" stroke="currentColor" strokeWidth="1.25" />
              <path d="M4 5V3.5a2 2 0 014 0V5" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" />
            </svg>
            <span className="af-note-label">Internal note</span>
            <span className="af-note-author">{item.from}</span>
          </div>
          <div className="af-note-bubble">{item.text}</div>
          <time className="af-msg-time" dateTime={item.time}>{formatTime(item.time)}</time>
        </div>
      );
      return;
    }

    // Audit event — lightweight centered row, no card chrome.
    const config = EVENT_CONFIG[item.eventType];
    const dotClass = config?.dotClass ?? 'hist-dot--unassigned';
    const labelNode = config ? config.label(item) : defaultLabel(item);

    renderedItems.push(
      <div key={`evt-${item.id}`} className="af-event" role="listitem">
        <span className="af-event-line" aria-hidden="true" />
        <span className={`hist-dot ${dotClass} af-event-dot`} aria-hidden="true" />
        <span className="af-event-line" aria-hidden="true" />
        <div className="af-event-body">
          <p className="hist-label af-event-label">{labelNode}</p>
          <time
            className="hist-time"
            dateTime={item.createdAt}
            title={new Date(item.createdAt).toLocaleString()}
          >
            {formatRelativeTime(item.createdAt)}
          </time>
        </div>
      </div>
    );
  });

  return (
    <div className="tp-tab-content tp-activity-content">
      {/* Filter segmented control */}
      <div className="af-filter-bar" role="group" aria-label="Filter activity">
        {AF_FILTERS.map((f) => (
          <button
            key={f.id}
            className={`af-filter-btn${activeFilter === f.id ? ' af-filter-btn--active' : ''}`}
            onClick={() => setActiveFilter(f.id)}
            aria-pressed={activeFilter === f.id}
          >
            {f.label}
            {counts[f.id] > 0 && (
              <span className={`af-filter-count${activeFilter === f.id ? ' af-filter-count--active' : ''}`}>
                {counts[f.id]}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Scrollable feed — position:relative so the jump button can anchor to it */}
      <div style={{ position: 'relative', flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
        <div
          className="af-feed"
          ref={feedRef}
          role="log"
          aria-live="polite"
          aria-label="All activity"
          onScroll={handleScroll}
        >
          {items.length === 0 ? (
            <div className="hist-empty" style={{ flex: 1 }}>
              <svg width="28" height="28" viewBox="0 0 36 36" fill="none" aria-hidden="true">
                <circle cx="18" cy="18" r="13" stroke="#cdd3de" strokeWidth="1.5" />
                <path d="M10 18h16M18 10v16" stroke="#cdd3de" strokeWidth="1.5" strokeLinecap="round" />
              </svg>
              <span>No {activeFilter === 'all' ? 'activity' : activeFilter + 's'} to show</span>
            </div>
          ) : (
            renderedItems
          )}
        </div>

        {/* Jump to latest floating button */}
        {showJumpBtn && (
          <button
            className="af-jump-btn"
            onClick={jumpToLatest}
            aria-label="Jump to latest activity"
          >
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
              <path d="M2 4l4 4 4-4" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            Latest
          </button>
        )}
      </div>

      {/* Read-only hint — positioned below the scrollable feed */}
      <div className="af-readonly-hint" aria-label="Composing hint">
        <svg width="11" height="11" viewBox="0 0 12 12" fill="none" aria-hidden="true">
          <circle cx="6" cy="6" r="4.5" stroke="currentColor" strokeWidth="1.2" />
          <path d="M6 5.5v3M6 4h.01" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
        </svg>
        Use the <strong>Communication</strong> or <strong>Notes</strong> tabs to reply
      </div>
    </div>
  );
}

// ── Main TicketPage component ──────────────────────────────────
// This replaces the old TicketDetail — it takes over the full main content
// area. onBack() resets the view to the ticket list.
export default function TicketPage({ ticketId, onBack, onViewCustomer }) {
  const { tickets, setTickets, loadTicket, updateTicket, deleteTicket } = useTickets();

  // Thin wrapper: patch the ticket then immediately re-fetch so the History tab
  // shows the newly-inserted event without requiring a manual page reload.
  // This is a deliberate trade-off: one extra GET per user action, but events are
  // always fresh. An alternative is to have the PATCH response include events —
  // that would save the round-trip but couples the response shape more tightly.
  async function updateAndRefresh(id, changes) {
    await updateTicket(id, changes);
    await loadTicket(id);
  }
  const { addToast } = useToast();
  const { user } = useAuth();
  const { boards } = useBoards();

  // Local tab state — purely presentational, no need to lift to context.
  // The active tab is scoped to this page instance and resets when the user
  // navigates back and selects a different ticket (because key={ticketId}
  // causes a full remount).
  const [activeTab, setActiveTab] = useState('communication');
  const [agents, setAgents] = useState([]);
  const [deleteConfirm, setDeleteConfirm] = useState(false);
  // Buffered edits — null means no unsaved changes. Fields are merged in as
  // the user touches each select; Save commits them all in one PATCH.
  const [draft, setDraft] = useState(null);
  const [isSaving, setIsSaving] = useState(false);

  const ticket = tickets.find((t) => t.id === ticketId);

  // Load messages on mount — same pattern as TicketDetail.
  useEffect(() => {
    loadTicket(ticketId).catch(() => addToast('Failed to load ticket', 'error'));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Fetch agent list for assignee picker.
  useEffect(() => {
    fetch('/api/auth/agents')
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then(setAgents)
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Merges a single field into the draft, seeding from the current saved
  // ticket values so we always have a complete snapshot ready to diff on save.
  function setDraftField(field, value) {
    setDraft((prev) => ({
      status:     ticket.status,
      priority:   ticket.priority,
      boardId:    ticket.boardId,
      assignedTo: ticket.assignedTo,
      ...(prev || {}),
      [field]: value,
    }));
  }

  function handleStatusChange(val)   { setDraftField('status', val); }
  function handlePriorityChange(val) { setDraftField('priority', val); }
  function handleBoardChange(val)    { setDraftField('boardId', val ? parseInt(val, 10) : null); }
  function handleAssigneeChange(val) { setDraftField('assignedTo', val); }

  // Commits only the fields that actually changed to avoid no-op PATCHes.
  async function handleSave() {
    if (!draft || isSaving) return;
    setIsSaving(true);
    const changes = {};
    if (draft.status     !== ticket.status)     changes.status      = draft.status;
    if (draft.priority   !== ticket.priority)   changes.priority    = draft.priority;
    if (draft.boardId    !== ticket.boardId)     changes.board_id    = draft.boardId;
    if (draft.assignedTo !== ticket.assignedTo) changes.assigned_to = draft.assignedTo;
    try {
      await updateAndRefresh(ticketId, changes);
      setDraft(null);
      addToast('Changes saved', 'success');
    } catch {
      addToast('Failed to save changes', 'error');
    } finally {
      setIsSaving(false);
    }
  }

  async function handleDelete() {
    if (!deleteConfirm) {
      setDeleteConfirm(true);
      return;
    }
    try {
      await deleteTicket(ticketId);
      addToast(`Ticket ${ticketId} deleted`, 'info');
      onBack();
    } catch {
      addToast('Failed to delete ticket', 'error');
      setDeleteConfirm(false);
    }
  }

  // While the ticket hasn't loaded into context yet, show a skeleton.
  // This happens on first mount when loadTicket() is still in-flight.
  if (!ticket) {
    return (
      <div className="tp-page tp-page--loading" role="main" aria-label="Loading ticket">
        <div className="tp-skeleton-header">
          <span className="tp-skeleton-block" style={{ width: 80 }} />
          <span className="tp-skeleton-block" style={{ width: 200 }} />
        </div>
        <div className="tp-body">
          <aside className="tp-sidebar">
            <div className="tp-card">
              {[100, 140, 100, 80].map((w, i) => (
                <span key={i} className="tp-skeleton-block" style={{ width: w, marginBottom: 12 }} />
              ))}
            </div>
            <div className="tp-card">
              {[120, 90, 110, 95, 130].map((w, i) => (
                <span key={i} className="tp-skeleton-block" style={{ width: w, marginBottom: 12 }} />
              ))}
            </div>
          </aside>
          <div className="tp-main">
            <div className="tp-skeleton-tab-bar">
              {[100, 110, 90, 70, 95].map((w, i) => (
                <span key={i} className="tp-skeleton-block" style={{ width: w }} />
              ))}
            </div>
            <div className="tp-skeleton-thread">
              {[260, 180, 320, 200].map((w, i) => (
                <span key={i} className="tp-skeleton-bubble" style={{ width: w, alignSelf: i % 2 === 1 ? 'flex-end' : 'flex-start' }} />
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  }

  const tabs = [
    { id: 'communication', label: 'Communication' },
    { id: 'notes', label: 'Internal Notes' },
    { id: 'resolution', label: 'Resolution' },
    { id: 'activity', label: 'All Activity' },
  ];

  return (
    <div className="tp-page" role="main">
      {/* ── Page header ── */}
      <header className="tp-header">
        <div className="tp-header-left">
          {/* Breadcrumb-style back button */}
          <button className="tp-back-btn" onClick={onBack} aria-label="Back to tickets">
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
              <path d="M8.5 2.5L4 7l4.5 4.5" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            Tickets
          </button>
          <span className="tp-header-divider" aria-hidden="true">/</span>
          <span className="tp-header-ref">{ticket.id}</span>
          <span className="tp-header-subject">{ticket.subject}</span>
        </div>

        <div className="tp-header-controls">
          <ControlSelect
            id={`status-${ticketId}`}
            label="Status"
            value={draft?.status ?? ticket.status}
            options={STATUS_OPTIONS}
            onChange={handleStatusChange}
          />
          <ControlSelect
            id={`priority-${ticketId}`}
            label="Priority"
            value={draft?.priority ?? ticket.priority}
            options={PRIORITY_OPTIONS}
            onChange={handlePriorityChange}
          />
          <ControlSelect
            id={`board-${ticketId}`}
            label="Board"
            value={String(draft !== null ? (draft.boardId ?? '') : (ticket.boardId || ''))}
            options={[
              { value: '', label: '— No board —' },
              ...boards.map((b) => ({ value: String(b.id), label: b.name })),
            ]}
            onChange={handleBoardChange}
          />
          <AssigneeSelect
            id={`assignee-${ticketId}`}
            agents={agents}
            assignedTo={draft !== null ? draft.assignedTo : ticket.assignedTo}
            onChange={handleAssigneeChange}
            disabled={isSaving}
          />
          {draft && (
            <button
              className="btn-save-ticket"
              onClick={handleSave}
              disabled={isSaving}
              aria-label="Save changes"
            >
              {isSaving ? (
                'Saving…'
              ) : (
                <>
                  <svg width="13" height="13" viewBox="0 0 13 13" fill="none" aria-hidden="true">
                    <path d="M2 7l3.5 3.5L11 3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                  Save
                </>
              )}
            </button>
          )}
          {user?.role === 'admin' && (
            deleteConfirm ? (
              <div className="tp-delete-confirm">
                <span className="tp-delete-confirm-label">Delete ticket?</span>
                <button
                  className="btn-action-cancel"
                  onClick={() => setDeleteConfirm(false)}
                >
                  Cancel
                </button>
                <button
                  className="btn-action-danger"
                  onClick={handleDelete}
                >
                  Delete
                </button>
              </div>
            ) : (
              <button className="btn-delete-ticket" onClick={handleDelete} aria-label="Delete ticket">
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
                  <path d="M2 3.5h10M5.5 3.5V2.5h3v1M3.5 3.5l.75 8h5.5l.75-8" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                Delete
              </button>
            )
          )}
        </div>
      </header>

      {/* ── Two-column body ── */}
      <div className="tp-body">

        {/* Left column — customer + metadata cards */}
        <aside className="tp-sidebar" aria-label="Ticket information">

          {/* Customer card */}
          <div className="tp-card">
            <div className="tp-card-title-row">
              <span className="tp-card-title">Customer</span>
              {onViewCustomer && (
                <button
                  className="tp-card-link-btn"
                  onClick={() => onViewCustomer(ticket.customerEmail)}
                  title="View customer record"
                >
                  View record →
                </button>
              )}
            </div>
            {ticket.customerName && (
              <div className="tp-info-row">
                <span className="tp-info-label">Name</span>
                <span className="tp-info-value">{ticket.customerName}</span>
              </div>
            )}
            <div className="tp-info-row">
              <span className="tp-info-label">Email</span>
              <a href={`mailto:${ticket.customerEmail}`} className="tp-info-value tp-info-link">
                {ticket.customerEmail}
              </a>
            </div>
            <div className="tp-info-row">
              <span className="tp-info-label">Phone</span>
              {ticket.phone ? (
                <a href={`tel:${ticket.phone}`} className="tp-info-value tp-info-link">
                  {ticket.phone}
                </a>
              ) : (
                <span className="tp-info-value tp-info-empty">—</span>
              )}
            </div>
            <div className="tp-info-row">
              <span className="tp-info-label">Company</span>
              <span className={`tp-info-value${!ticket.company ? ' tp-info-empty' : ''}`}>
                {ticket.company || '—'}
              </span>
            </div>
          </div>

          {/* Ticket metadata card */}
          <div className="tp-card">
            <div className="tp-card-title">Ticket Info</div>
            <div className="tp-info-row">
              <span className="tp-info-label">ID</span>
              <span className="tp-info-value tp-info-id">{ticket.id}</span>
            </div>
            <div className="tp-info-row">
              <span className="tp-info-label">Category</span>
              <span className="tp-info-value">{ticket.category}</span>
            </div>
            <div className="tp-info-row">
              <span className="tp-info-label">Status</span>
              <span className={`badge badge-${ticket.status}`}>{STATUS_LABELS[ticket.status] ?? ticket.status}</span>
            </div>
            <div className="tp-info-row">
              <span className="tp-info-label">Priority</span>
              <span className={`badge badge-${ticket.priority}`}>{ticket.priority}</span>
            </div>
            <div className="tp-info-row">
              <span className="tp-info-label">Opened</span>
              <time className="tp-info-value" dateTime={ticket.createdAt}>
                {formatDate(ticket.createdAt)}
              </time>
            </div>
            <div className="tp-info-row">
              <span className="tp-info-label">Board</span>
              {ticket.boardName ? (
                <span className="tp-board-badge">{ticket.boardName}</span>
              ) : (
                <span className="tp-info-value tp-info-empty">None</span>
              )}
            </div>
            <div className="tp-info-row">
              <span className="tp-info-label">Assigned</span>
              {ticket.assignedTo ? (
                <span className="tp-info-value" style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                  <span className="assignee-avatar-xs" aria-hidden="true">
                    {initials(ticket.assigneeName)}
                  </span>
                  {ticket.assigneeName}
                </span>
              ) : (
                <span className="tp-info-value tp-info-empty">Unassigned</span>
              )}
            </div>
            <div className="tp-info-row">
              <span className="tp-info-label">Messages</span>
              <span className="tp-info-value">
                {(ticket.messages || []).filter((m) => m.type !== 'note').length}
              </span>
            </div>
            {ticket.firstResponseDueAt && (
              <div className="tp-info-row">
                <span className="tp-info-label">SLA Response</span>
                <SlaCountdown dueAt={ticket.firstResponseDueAt} />
              </div>
            )}
            {ticket.resolutionDueAt && (
              <div className="tp-info-row">
                <span className="tp-info-label">SLA Resolution</span>
                <SlaCountdown dueAt={ticket.resolutionDueAt} />
              </div>
            )}
          </div>

        </aside>

        {/* Right column — tabbed work area */}
        <div className="tp-main" role="region" aria-label="Ticket workspace">
          {/* Tab bar */}
          <div className="tp-tabs" role="tablist" aria-label="Ticket sections">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                role="tab"
                id={`tab-${tab.id}`}
                aria-selected={activeTab === tab.id}
                aria-controls={`tabpanel-${tab.id}`}
                className={`tp-tab${activeTab === tab.id ? ' tp-tab--active' : ''}`}
                onClick={() => setActiveTab(tab.id)}
              >
                {tab.label}
                {/* Badge showing count of notes on the Internal Notes tab */}
                {tab.id === 'notes' && (ticket.messages || []).filter((m) => m.type === 'note').length > 0 && (
                  <span className="tp-tab-badge">
                    {(ticket.messages || []).filter((m) => m.type === 'note').length}
                  </span>
                )}
                {/* All Activity badge: total messages + events */}
                {tab.id === 'activity' && (
                  (ticket.messages || []).length + (ticket.events ?? []).length
                ) > 0 && (
                  <span className="tp-tab-badge">
                    {(ticket.messages || []).length + (ticket.events ?? []).length}
                  </span>
                )}
              </button>
            ))}
          </div>

          {/* Tab panels — only the active one renders.
              Why not always render all three and use CSS display:none?
              Because the Communication and Notes tabs have autoscroll
              effects tied to message count. Hidden panels would still
              run those effects, causing spurious scroll jumps. Conditional
              render + key prop is the simpler model here. */}
          <div
            role="tabpanel"
            id={`tabpanel-${activeTab}`}
            aria-labelledby={`tab-${activeTab}`}
            className="tp-tabpanel"
          >
            {activeTab === 'communication' && (
              <CommunicationTab ticket={ticket} ticketId={ticketId} />
            )}
            {activeTab === 'notes' && (
              <InternalNotesTab ticket={ticket} ticketId={ticketId} />
            )}
            {activeTab === 'resolution' && (
              <ResolutionTab ticket={ticket} ticketId={ticketId} onUpdate={updateAndRefresh} />
            )}
            {activeTab === 'activity' && (
              <AllActivityTab ticket={ticket} />
            )}
          </div>
        </div>

      </div>
    </div>
  );
}
