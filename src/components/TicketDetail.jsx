import { useState, useRef, useEffect } from 'react';
import { useTickets } from '../context/TicketContext';

const SUPPORT_EMAIL = 'support@company.com';

/* ── helpers ─────────────────────────────────────────────── */
function formatMessageTime(iso) {
  return new Date(iso).toLocaleString([], {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatHeaderDate(iso) {
  return new Date(iso).toLocaleString([], {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/* ── empty state ─────────────────────────────────────────── */
export function EmptyState() {
  return (
    <div className="empty-state" role="main" aria-label="No ticket selected">
      <div className="empty-state-icon" aria-hidden="true">
        <svg width="32" height="32" viewBox="0 0 32 32" fill="none">
          <rect x="4" y="5" width="24" height="22" rx="4" stroke="#cdd3de" strokeWidth="1.5" />
          <path
            d="M9 11h14M9 16h9M9 21h6"
            stroke="#cdd3de"
            strokeWidth="1.5"
            strokeLinecap="round"
          />
        </svg>
      </div>
      <h2>Select a ticket</h2>
      <p>Choose a ticket from the list to view the conversation and manage it.</p>
    </div>
  );
}

/* ── priority / status select ────────────────────────────── */
const PRIORITY_OPTIONS = ['low', 'medium', 'high', 'urgent'];
const STATUS_OPTIONS   = ['open', 'pending', 'resolved', 'closed'];

function ControlSelect({ id, label, value, options, onChange }) {
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
      >
        {options.map((o) => (
          <option key={o} value={o}>
            {o.charAt(0).toUpperCase() + o.slice(1)}
          </option>
        ))}
      </select>
    </div>
  );
}

/* ── message bubble ──────────────────────────────────────── */
function MessageGroup({ message }) {
  const isSupport = message.from === SUPPORT_EMAIL;
  const side = isSupport ? 'support' : 'customer';

  return (
    <div className={`message-group ${side}`}>
      <span className="message-sender">
        {isSupport ? 'Support' : message.from}
      </span>
      <div className="message-bubble" role="article">
        {message.text}
      </div>
      <time className="message-time" dateTime={message.time}>
        {formatMessageTime(message.time)}
      </time>
    </div>
  );
}

/* ── main component ──────────────────────────────────────── */
export default function TicketDetail({ ticketId }) {
  const { tickets, updateTicket, addMessage } = useTickets();
  const ticket = tickets.find((t) => t.id === ticketId);

  const [replyText, setReplyText] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [justSent, setJustSent] = useState(false);
  const threadRef = useRef(null);
  const textareaRef = useRef(null);

  // Scroll to bottom whenever messages change or ticket changes
  useEffect(() => {
    if (threadRef.current) {
      threadRef.current.scrollTop = threadRef.current.scrollHeight;
    }
  }, [ticket?.messages?.length, ticketId]);

  // State resets automatically on ticket change because the parent passes key={ticketId}
  // which causes React to unmount/remount this component fresh for each ticket.

  function handleStatusChange(newStatus) {
    updateTicket(ticketId, { status: newStatus });
  }

  function handlePriorityChange(newPriority) {
    updateTicket(ticketId, { priority: newPriority });
  }

  function handleSend() {
    const text = replyText.trim();
    if (!text || isSending) return;

    setIsSending(true);

    // Optimistic: add immediately
    addMessage(ticketId, { from: SUPPORT_EMAIL, text });
    setReplyText('');
    setJustSent(true);
    setIsSending(false);

    // Reset the "just sent" checkmark after a moment
    setTimeout(() => setJustSent(false), 2000);

    // Re-focus textarea for quick follow-up replies
    requestAnimationFrame(() => {
      textareaRef.current?.focus();
    });
  }

  function handleKeyDown(e) {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      e.preventDefault();
      handleSend();
    }
  }

  if (!ticket) return null;

  const canSend = replyText.trim().length > 0 && !isSending;

  return (
    <div className="detail-panel" key={ticketId}>
      {/* Header */}
      <header className="detail-header">
        <div className="detail-header-top">
          <div className="detail-header-left">
            <div className="detail-ticket-id" aria-label={`Ticket ${ticket.id}`}>
              {ticket.id}
            </div>
            <h1 className="detail-subject">{ticket.subject}</h1>
          </div>

          <div className="detail-controls" role="group" aria-label="Ticket controls">
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
          </div>
        </div>

        <div className="detail-meta-row" aria-label="Ticket metadata">
          {/* Category */}
          <div className="detail-meta-item">
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
              <path
                d="M1 2.5A1.5 1.5 0 012.5 1h2.086a1.5 1.5 0 011.06.44l4.415 4.414a1.5 1.5 0 010 2.122l-2.086 2.085a1.5 1.5 0 01-2.121 0L1.44 5.646A1.5 1.5 0 011 4.586V2.5z"
                stroke="currentColor"
                strokeWidth="1.2"
              />
              <circle cx="3.5" cy="3.5" r="0.75" fill="currentColor" />
            </svg>
            <span>{ticket.category}</span>
          </div>

          <div className="detail-meta-separator" aria-hidden="true" />

          {/* Customer email */}
          <div className="detail-meta-item">
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
              <rect x="1" y="2.5" width="10" height="7" rx="1.5" stroke="currentColor" strokeWidth="1.2" />
              <path d="M1 4l5 3 5-3" stroke="currentColor" strokeWidth="1.2" />
            </svg>
            <a
              href={`mailto:${ticket.customerEmail}`}
              style={{ color: 'inherit', textDecoration: 'none' }}
            >
              {ticket.customerEmail}
            </a>
          </div>

          <div className="detail-meta-separator" aria-hidden="true" />

          {/* Created date */}
          <div className="detail-meta-item">
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
              <rect x="1" y="2" width="10" height="9" rx="1.5" stroke="currentColor" strokeWidth="1.2" />
              <path d="M8 1v2M4 1v2M1 5h10" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
            </svg>
            <time dateTime={ticket.createdAt}>{formatHeaderDate(ticket.createdAt)}</time>
          </div>

          <div className="detail-meta-separator" aria-hidden="true" />

          {/* Message count */}
          <div className="detail-meta-item">
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
              <path
                d="M1.5 3A1.5 1.5 0 013 1.5h6A1.5 1.5 0 0110.5 3v5A1.5 1.5 0 019 9.5H7L4.5 11.5V9.5H3A1.5 1.5 0 011.5 8V3z"
                stroke="currentColor"
                strokeWidth="1.2"
              />
            </svg>
            <span>
              {ticket.messages.length} message{ticket.messages.length !== 1 ? 's' : ''}
            </span>
          </div>

          {/* Status badge inline */}
          <div className="detail-meta-separator" aria-hidden="true" />
          <span className={`badge badge-${ticket.status}`}>
            {ticket.status}
          </span>
          <span className={`badge badge-${ticket.priority}`}>
            {ticket.priority}
          </span>
        </div>
      </header>

      {/* Thread */}
      <div
        className="message-thread"
        ref={threadRef}
        role="log"
        aria-live="polite"
        aria-label="Message thread"
      >
        {ticket.messages.length === 0 ? (
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              flex: 1,
              gap: 8,
              color: 'var(--gray-400)',
              fontSize: 13,
              padding: '40px 20px',
            }}
          >
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
          ticket.messages.map((msg, i) => (
            <MessageGroup key={`${msg.time}-${i}`} message={msg} />
          ))
        )}
      </div>

      {/* Reply box */}
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
        <p
          style={{
            fontSize: 11,
            color: 'var(--gray-400)',
            marginTop: 8,
            textAlign: 'right',
          }}
        >
          Ctrl+Enter to send quickly
        </p>
      </div>
    </div>
  );
}
