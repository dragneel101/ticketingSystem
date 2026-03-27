import { useState, useEffect, useRef, useCallback } from 'react';
import { useTickets } from '../context/TicketContext';

const CATEGORIES = ['Account', 'Billing', 'Feature Request', 'Technical', 'General'];
const PRIORITIES = ['low', 'medium', 'high', 'urgent'];

const INITIAL_FORM = {
  subject: '',
  customerEmail: '',
  category: 'Account',
  priority: 'medium',
};

const INITIAL_ERRORS = {
  subject: '',
  customerEmail: '',
};

function validateEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

/* ── close on Escape ─────────────────────────────────────── */
function useEscapeKey(handler) {
  useEffect(() => {
    function onKeyDown(e) {
      if (e.key === 'Escape') handler();
    }
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [handler]);
}

/* ── focus trap ──────────────────────────────────────────── */
function useFocusTrap(ref, active) {
  useEffect(() => {
    if (!active || !ref.current) return;

    const el = ref.current;
    const focusable = el.querySelectorAll(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
    );
    const first = focusable[0];
    const last = focusable[focusable.length - 1];

    function trap(e) {
      if (e.key !== 'Tab') return;
      if (e.shiftKey) {
        if (document.activeElement === first) {
          e.preventDefault();
          last.focus();
        }
      } else {
        if (document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    }

    el.addEventListener('keydown', trap);
    first?.focus();

    return () => el.removeEventListener('keydown', trap);
  }, [ref, active]);
}

/* ── priority indicator ──────────────────────────────────── */
function PriorityOption({ value, selected, onClick }) {
  const labels = {
    low: 'Low — no rush',
    medium: 'Medium — standard queue',
    high: 'High — elevated urgency',
    urgent: 'Urgent — needs immediate attention',
  };

  return (
    <button
      type="button"
      onClick={() => onClick(value)}
      className={`priority-option${selected ? ' selected' : ''}`}
      aria-pressed={selected}
      title={labels[value]}
      style={{
        flex: 1,
        padding: '7px 4px',
        border: '1.5px solid',
        borderRadius: 'var(--r-md)',
        cursor: 'pointer',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 4,
        transition: 'all var(--t-fast) var(--ease)',
        fontFamily: 'var(--sans)',
        fontSize: 11,
        fontWeight: selected ? 700 : 500,
        ...(selected
          ? getPrioritySelected(value)
          : {
              background: 'var(--gray-50)',
              borderColor: 'var(--gray-200)',
              color: 'var(--gray-500)',
            }),
      }}
    >
      <span
        style={{
          width: 8,
          height: 8,
          borderRadius: '50%',
          background: getPriorityDot(value),
          display: 'block',
        }}
        aria-hidden="true"
      />
      <span style={{ textTransform: 'capitalize' }}>{value}</span>
    </button>
  );
}

function getPriorityDot(p) {
  const map = {
    low: 'var(--p-low-dot)',
    medium: 'var(--p-medium-dot)',
    high: 'var(--p-high-dot)',
    urgent: 'var(--p-urgent-dot)',
  };
  return map[p] || map.low;
}

function getPrioritySelected(p) {
  const map = {
    low:    { background: 'var(--p-low-bg)',    borderColor: 'var(--p-low-dot)',    color: 'var(--p-low-text)' },
    medium: { background: 'var(--p-medium-bg)', borderColor: 'var(--p-medium-dot)', color: 'var(--p-medium-text)' },
    high:   { background: 'var(--p-high-bg)',   borderColor: 'var(--p-high-dot)',   color: 'var(--p-high-text)' },
    urgent: { background: 'var(--p-urgent-bg)', borderColor: 'var(--p-urgent-dot)', color: 'var(--p-urgent-text)' },
  };
  return map[p] || map.low;
}

/* ── main component ──────────────────────────────────────── */
export default function NewTicketForm({ onClose, onCreated }) {
  const { addTicket } = useTickets();
  const [form, setForm] = useState(INITIAL_FORM);
  const [errors, setErrors] = useState(INITIAL_ERRORS);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const modalRef = useRef(null);

  useEscapeKey(onClose);
  useFocusTrap(modalRef, true);

  const setField = useCallback((field, value) => {
    setForm((prev) => ({ ...prev, [field]: value }));
    // Clear error on change
    if (errors[field]) {
      setErrors((prev) => ({ ...prev, [field]: '' }));
    }
  }, [errors]);

  function validate() {
    const next = { subject: '', customerEmail: '' };
    let ok = true;

    if (!form.subject.trim()) {
      next.subject = 'Subject is required';
      ok = false;
    } else if (form.subject.trim().length < 5) {
      next.subject = 'Subject must be at least 5 characters';
      ok = false;
    }

    if (!form.customerEmail.trim()) {
      next.customerEmail = 'Customer email is required';
      ok = false;
    } else if (!validateEmail(form.customerEmail)) {
      next.customerEmail = 'Please enter a valid email address';
      ok = false;
    }

    setErrors(next);
    return ok;
  }

  function handleSubmit(e) {
    e.preventDefault();
    if (!validate() || isSubmitting) return;

    setIsSubmitting(true);

    // Small artificial delay for perceived quality — feels less like a debug form
    setTimeout(() => {
      addTicket({
        subject: form.subject.trim(),
        customerEmail: form.customerEmail.trim().toLowerCase(),
        category: form.category,
        priority: form.priority,
      });

      setSubmitted(true);
      setIsSubmitting(false);

      setTimeout(() => {
        onCreated?.();
        onClose();
      }, 900);
    }, 350);
  }

  // Close on backdrop click
  function handleBackdropClick(e) {
    if (e.target === e.currentTarget) onClose();
  }

  return (
    <div
      className="modal-overlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby="new-ticket-title"
      onClick={handleBackdropClick}
    >
      <div className="modal" ref={modalRef}>
        {/* Header */}
        <div className="modal-header">
          <div>
            <div className="modal-title" id="new-ticket-title">
              Create New Ticket
            </div>
            <div className="modal-subtitle">
              Fill in the details below to open a support ticket
            </div>
          </div>
          <button
            className="btn-close"
            onClick={onClose}
            aria-label="Close dialog"
          >
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
              <path d="M1 1l10 10M11 1L1 11" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
            </svg>
          </button>
        </div>

        {/* Body */}
        <form onSubmit={handleSubmit} noValidate>
          <div className="modal-body">
            {/* Subject */}
            <div className="form-group">
              <label htmlFor="new-subject" className="form-label">
                Subject <span className="required" aria-hidden="true">*</span>
              </label>
              <input
                id="new-subject"
                type="text"
                className={`form-input${errors.subject ? ' error' : ''}`}
                placeholder="Brief description of the issue"
                value={form.subject}
                onChange={(e) => setField('subject', e.target.value)}
                aria-required="true"
                aria-describedby={errors.subject ? 'subject-error' : undefined}
                aria-invalid={!!errors.subject}
                maxLength={120}
              />
              {errors.subject && (
                <span id="subject-error" className="form-error" role="alert">
                  <svg width="11" height="11" viewBox="0 0 11 11" fill="none" aria-hidden="true">
                    <circle cx="5.5" cy="5.5" r="4.5" stroke="currentColor" strokeWidth="1.2" />
                    <path d="M5.5 3.5v2.5M5.5 7.5v.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
                  </svg>
                  {errors.subject}
                </span>
              )}
            </div>

            {/* Customer email */}
            <div className="form-group">
              <label htmlFor="new-email" className="form-label">
                Customer Email <span className="required" aria-hidden="true">*</span>
              </label>
              <input
                id="new-email"
                type="email"
                className={`form-input${errors.customerEmail ? ' error' : ''}`}
                placeholder="customer@example.com"
                value={form.customerEmail}
                onChange={(e) => setField('customerEmail', e.target.value)}
                aria-required="true"
                aria-describedby={errors.customerEmail ? 'email-error' : undefined}
                aria-invalid={!!errors.customerEmail}
              />
              {errors.customerEmail && (
                <span id="email-error" className="form-error" role="alert">
                  <svg width="11" height="11" viewBox="0 0 11 11" fill="none" aria-hidden="true">
                    <circle cx="5.5" cy="5.5" r="4.5" stroke="currentColor" strokeWidth="1.2" />
                    <path d="M5.5 3.5v2.5M5.5 7.5v.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
                  </svg>
                  {errors.customerEmail}
                </span>
              )}
            </div>

            {/* Category + priority row */}
            <div className="form-row">
              <div className="form-group">
                <label htmlFor="new-category" className="form-label">Category</label>
                <select
                  id="new-category"
                  className="form-select"
                  value={form.category}
                  onChange={(e) => setField('category', e.target.value)}
                >
                  {CATEGORIES.map((c) => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
              </div>

              <div className="form-group" style={{ gridColumn: '1 / -1' }}>
                <span className="form-label" id="priority-group-label">Priority</span>
                <div
                  style={{ display: 'flex', gap: 6 }}
                  role="group"
                  aria-labelledby="priority-group-label"
                >
                  {PRIORITIES.map((p) => (
                    <PriorityOption
                      key={p}
                      value={p}
                      selected={form.priority === p}
                      onClick={(v) => setField('priority', v)}
                    />
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* Footer */}
          <div className="modal-footer">
            <button type="button" className="btn btn-ghost" onClick={onClose}>
              Cancel
            </button>
            <button
              type="submit"
              className="btn btn-primary"
              disabled={isSubmitting || submitted}
              aria-live="polite"
            >
              {submitted ? (
                <>
                  <svg width="13" height="13" viewBox="0 0 13 13" fill="none" aria-hidden="true">
                    <path d="M2 7l3.5 3.5L11 3" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                  Ticket Created
                </>
              ) : isSubmitting ? (
                'Creating…'
              ) : (
                <>
                  <svg width="13" height="13" viewBox="0 0 13 13" fill="none" aria-hidden="true">
                    <path d="M6.5 1v11.5M1 6.5h11.5" stroke="#fff" strokeWidth="2" strokeLinecap="round" />
                  </svg>
                  Create Ticket
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
