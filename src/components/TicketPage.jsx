import { useState, useRef, useEffect, useCallback } from 'react';
import { useTickets } from '../context/TicketContext';
import { useToast } from '../context/ToastContext';
import { useAuth } from '../context/AuthContext';
import SlaCountdown from './SlaCountdown';
import { STATUS_OPTIONS, STATUS_LABELS, TERMINAL_STATUSES } from '../utils/statusConfig';
import { useBoards } from '../context/BoardContext';

const SUPPORT_EMAIL = 'support@company.com';

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
function MessageBubble({ message }) {
  const isSupport = message.from === SUPPORT_EMAIL;
  const side = isSupport ? 'support' : 'customer';
  return (
    <div className={`message-group ${side}`}>
      <span className="message-sender">{isSupport ? 'Support' : message.from}</span>
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
  const [replyText, setReplyText] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [justSent, setJustSent] = useState(false);
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
      await addMessage(ticketId, { from: SUPPORT_EMAIL, text, type: 'message' });
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
            <MessageBubble key={`${msg.time}-${i}`} message={msg} />
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
          <div className="reply-footer">
            <span className="reply-sender-label">
              <svg width="11" height="11" viewBox="0 0 12 12" fill="none" aria-hidden="true">
                <circle cx="6" cy="4" r="2.5" stroke="currentColor" strokeWidth="1.2" />
                <path d="M1.5 10.5c0-2.485 2.015-4.5 4.5-4.5s4.5 2.015 4.5 4.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
              </svg>
              Replying as <strong>{SUPPORT_EMAIL}</strong>
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

// ── All Activity tab ──────────────────────────────────────────
// Merges messages and audit events into a single chronological timeline.
// Read-only — agents compose in the Communication and Notes tabs.
function AllActivityTab({ ticket }) {
  const threadRef = useRef(null);

  // Build a unified, sorted list of activity items.
  // Each item gets a `_kind` discriminator so the renderer knows which
  // visual treatment to apply without re-checking the shape each time.
  const items = [
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

  // Auto-scroll to bottom when items change (same pattern as Communication/Notes tabs).
  useEffect(() => {
    if (threadRef.current) {
      threadRef.current.scrollTop = threadRef.current.scrollHeight;
    }
  }, [items.length]);

  if (items.length === 0) {
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

  return (
    <div className="tp-tab-content tp-activity-content">
      <div
        className="af-feed"
        ref={threadRef}
        role="log"
        aria-live="polite"
        aria-label="All activity"
      >
        {items.map((item, i) => {
          if (item._kind === 'message') {
            const isSupport = item.from === SUPPORT_EMAIL;
            return (
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
                <div className="af-msg-bubble">
                  {item.text}
                </div>
                <time className="af-msg-time" dateTime={item.time}>
                  {formatTime(item.time)}
                </time>
              </div>
            );
          }

          if (item._kind === 'note') {
            return (
              <div
                key={`note-${item.time}-${i}`}
                className="af-note"
                role="article"
              >
                <div className="af-note-header">
                  {/* Lock icon — signals internal-only to agents scanning quickly */}
                  <svg className="af-note-icon" width="11" height="11" viewBox="0 0 12 12" fill="none" aria-hidden="true">
                    <rect x="2" y="5" width="8" height="6" rx="1.5" stroke="currentColor" strokeWidth="1.25" />
                    <path d="M4 5V3.5a2 2 0 014 0V5" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" />
                  </svg>
                  <span className="af-note-label">Internal note</span>
                  <span className="af-note-author">{item.from}</span>
                </div>
                <div className="af-note-bubble">
                  {item.text}
                </div>
                <time className="af-msg-time" dateTime={item.time}>
                  {formatTime(item.time)}
                </time>
              </div>
            );
          }

          // Audit event — lightweight centered row, no card chrome.
          // Reuses EVENT_CONFIG + defaultLabel exactly as HistoryTab does.
          const config = EVENT_CONFIG[item.eventType];
          const dotClass = config?.dotClass ?? 'hist-dot--unassigned';
          const labelNode = config ? config.label(item) : defaultLabel(item);

          return (
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
        })}
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

function HistoryTab({ ticket }) {
  const events = ticket.events ?? [];

  if (events.length === 0) {
    return (
      <div className="tp-tab-content">
        <div className="hist-empty">
          <svg width="36" height="36" viewBox="0 0 36 36" fill="none" aria-hidden="true">
            <circle cx="18" cy="18" r="13" stroke="#cdd3de" strokeWidth="1.5" />
            <path d="M18 11v7l4 4" stroke="#cdd3de" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          <span>No history yet</span>
        </div>
      </div>
    );
  }

  return (
    <div className="tp-tab-content tp-history-content">
      <ol className="hist-timeline" aria-label="Ticket history">
        {events.map((event) => {
          const config = EVENT_CONFIG[event.eventType];
          const dotClass = config?.dotClass ?? 'hist-dot--unassigned';
          const labelNode = config ? config.label(event) : defaultLabel(event);

          return (
            <li key={event.id} className="hist-row">
              {/* The connecting line lives as a pseudo-element on .hist-row;
                  the dot sits on top of it, so we put it in the DOM here */}
              <span className={`hist-dot ${dotClass}`} aria-hidden="true" />
              <div className="hist-content">
                <p className="hist-label">{labelNode}</p>
                <time
                  className="hist-time"
                  dateTime={event.createdAt}
                  title={new Date(event.createdAt).toLocaleString()}
                >
                  {formatRelativeTime(event.createdAt)}
                </time>
              </div>
            </li>
          );
        })}
      </ol>
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
  const [isAssigning, setIsAssigning] = useState(false);
  const [agents, setAgents] = useState([]);
  const [deleteConfirm, setDeleteConfirm] = useState(false);

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

  // Optimistic update helpers — apply the change locally first for instant
  // feedback, then confirm with the server. On error, roll back to the
  // snapshot taken before the optimistic write.
  async function handleStatusChange(newStatus) {
    const prev = ticket.status;
    // Optimistic: update context immediately so the badge/select reflects the
    // new value without waiting for the network round-trip.
    setTickets((ts) => ts.map((t) => t.id === ticketId ? { ...t, status: newStatus } : t));
    try {
      await updateAndRefresh(ticketId, { status: newStatus });
      addToast(`Status → ${STATUS_LABELS[newStatus] ?? newStatus}`, 'info');
    } catch {
      // Roll back to previous value on failure.
      setTickets((ts) => ts.map((t) => t.id === ticketId ? { ...t, status: prev } : t));
      addToast('Failed to update status', 'error');
    }
  }

  async function handlePriorityChange(newPriority) {
    const prev = ticket.priority;
    setTickets((ts) => ts.map((t) => t.id === ticketId ? { ...t, priority: newPriority } : t));
    try {
      await updateAndRefresh(ticketId, { priority: newPriority });
      addToast(`Priority → ${newPriority}`, 'info');
    } catch {
      setTickets((ts) => ts.map((t) => t.id === ticketId ? { ...t, priority: prev } : t));
      addToast('Failed to update priority', 'error');
    }
  }

  async function handleBoardChange(newBoardId) {
    const prev = ticket.boardId;
    const parsedId = newBoardId ? parseInt(newBoardId, 10) : null;
    setTickets((ts) => ts.map((t) => t.id === ticketId ? { ...t, boardId: parsedId } : t));
    try {
      await updateAndRefresh(ticketId, { board_id: parsedId });
      addToast('Board updated', 'info');
    } catch {
      setTickets((ts) => ts.map((t) => t.id === ticketId ? { ...t, boardId: prev } : t));
      addToast('Failed to update board', 'error');
    }
  }

  async function handleAssigneeChange(userId) {
    const prev = ticket.assignedTo;
    setIsAssigning(true);
    setTickets((ts) => ts.map((t) => t.id === ticketId ? { ...t, assignedTo: userId } : t));
    try {
      await updateAndRefresh(ticketId, { assigned_to: userId });
      const agent = agents.find((a) => a.id === userId);
      addToast(userId === null ? 'Ticket unassigned' : `Assigned to ${agent?.name ?? 'agent'}`, userId === null ? 'info' : 'success');
    } catch {
      setTickets((ts) => ts.map((t) => t.id === ticketId ? { ...t, assignedTo: prev } : t));
      addToast('Failed to update assignment', 'error');
    } finally {
      setIsAssigning(false);
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
    { id: 'history', label: 'History' },
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
            value={ticket.status}
            options={STATUS_OPTIONS}
            onChange={handleStatusChange}
          />
          <ControlSelect
            id={`priority-${ticketId}`}
            label="Priority"
            value={ticket.priority}
            options={PRIORITY_OPTIONS}
            onChange={handlePriorityChange}
          />
          <ControlSelect
            id={`board-${ticketId}`}
            label="Board"
            value={String(ticket.boardId || '')}
            options={[
              { value: '', label: '— No board —' },
              ...boards.map((b) => ({ value: String(b.id), label: b.name })),
            ]}
            onChange={handleBoardChange}
          />
          <AssigneeSelect
            id={`assignee-${ticketId}`}
            agents={agents}
            assignedTo={ticket.assignedTo}
            onChange={handleAssigneeChange}
            disabled={isAssigning}
          />
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
                {/* Show event count on the History tab so agents notice activity */}
                {tab.id === 'history' && (ticket.events ?? []).length > 0 && (
                  <span className="tp-tab-badge">
                    {(ticket.events ?? []).length}
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
            {activeTab === 'history' && (
              <HistoryTab ticket={ticket} />
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
