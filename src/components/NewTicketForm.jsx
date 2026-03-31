import { useState, useEffect, useRef, useCallback } from 'react';
import { useTickets } from '../context/TicketContext';
import { useToast } from '../context/ToastContext';

const CATEGORIES = ['Account', 'Billing', 'Feature Request', 'Technical', 'General'];
const PRIORITIES = ['low', 'medium', 'high', 'urgent'];

const INITIAL_FORM = {
  subject: '',
  customerEmail: '',
  customerName: '',
  customerId: null,
  phone: '',
  company: '',
  companyId: null,
  category: 'Account',
  priority: 'medium',
  initialMessage: '',
};

const INITIAL_ERRORS = {
  subject: '',
  customerEmail: '',
  customerName: '',
  company: '',
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
  const { addToast } = useToast();
  const [form, setForm] = useState(INITIAL_FORM);
  const [errors, setErrors] = useState(INITIAL_ERRORS);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [customerFound, setCustomerFound] = useState(null); // { name, company } | null
  const [companySuggestions, setCompanySuggestions] = useState([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [nameSuggestions, setNameSuggestions] = useState([]);
  const [showNameSuggestions, setShowNameSuggestions] = useState(false);
  const modalRef = useRef(null);
  const lookupTimerRef = useRef(null);
  const suggestTimerRef = useRef(null);
  const nameTimerRef = useRef(null);

  useEscapeKey(onClose);
  useFocusTrap(modalRef, true);

  const setField = useCallback((field, value) => {
    setForm((prev) => ({ ...prev, [field]: value }));
    if (errors[field]) {
      setErrors((prev) => ({ ...prev, [field]: '' }));
    }
  }, [errors]);

  // Debounced customer lookup — fires 450ms after the user stops typing in the email field.
  // On exact match, pre-fills phone/company/name only if the fields are still empty
  // (so manual edits are never overwritten).
  const handleEmailChange = useCallback((e) => {
    const email = e.target.value;
    setField('customerEmail', email);
    setCustomerFound(null);

    clearTimeout(lookupTimerRef.current);
    if (!validateEmail(email)) return;

    lookupTimerRef.current = setTimeout(async () => {
      try {
        const res = await fetch(`/api/customers?search=${encodeURIComponent(email)}&limit=5`);
        if (!res.ok) return;
        const data = await res.json();
        const match = (data.customers || []).find(
          (c) => c.email.toLowerCase() === email.toLowerCase()
        );
        if (!match) return;

        setCustomerFound({ name: match.name, company: match.company || '' });
        // Pre-fill all fields from the matched record, but never overwrite
        // values the user already typed manually. Always set the ids so
        // validation knows this customer is properly linked.
        setForm((prev) => ({
          ...prev,
          customerName: prev.customerName || match.name || '',
          customerId: match.id,
          phone: prev.phone || match.phone || '',
          company: prev.company || match.company || '',
          companyId: prev.companyId || match.company_id || null,
        }));
      } catch {
        // silently ignore — lookup is best-effort
      }
    }, 450);
  }, [setField]);

  const handleCompanyChange = useCallback((e) => {
    const val = e.target.value;
    setField('company', val);
    // Reset the linked company_id when the user types manually
    setForm((prev) => ({ ...prev, companyId: null }));
    setShowSuggestions(false);
    clearTimeout(suggestTimerRef.current);
    if (val.trim().length >= 2) {
      suggestTimerRef.current = setTimeout(async () => {
        try {
          const res = await fetch(`/api/companies/suggest?q=${encodeURIComponent(val.trim())}`);
          if (!res.ok) return;
          const data = await res.json();
          setCompanySuggestions(data);
          setShowSuggestions(data.length > 0);
        } catch {
          // silently ignore
        }
      }, 300);
    } else {
      setCompanySuggestions([]);
    }
  }, [setField]);

  function handleSelectSuggestion(suggestion) {
    setForm((prev) => ({
      ...prev,
      company: suggestion.name,
      companyId: suggestion.id,
    }));
    setCompanySuggestions([]);
    setShowSuggestions(false);
  }

  const handleNameChange = useCallback((e) => {
    const val = e.target.value;
    // Typing in the name field breaks the customer link — the user is
    // manually editing, so we clear the id until they pick from suggestions.
    setForm((prev) => ({ ...prev, customerName: val, customerId: null }));
    if (errors.customerName) {
      setErrors((prev) => ({ ...prev, customerName: '' }));
    }
    setCustomerFound(null);
    setShowNameSuggestions(false);
    clearTimeout(nameTimerRef.current);

    if (val.trim().length >= 2) {
      nameTimerRef.current = setTimeout(async () => {
        try {
          const res = await fetch(`/api/customers/suggest?q=${encodeURIComponent(val.trim())}`);
          if (!res.ok) return;
          const data = await res.json();
          setNameSuggestions(data);
          setShowNameSuggestions(data.length > 0);
        } catch {
          // silently ignore
        }
      }, 300);
    } else {
      setNameSuggestions([]);
    }
  }, [errors.customerName]);

  function handleSelectNameSuggestion(customer) {
    // Selecting from the dropdown pre-fills all related fields and locks
    // in the customerId so validation passes.
    setForm((prev) => ({
      ...prev,
      customerName: customer.name,
      customerId: customer.id,
      customerEmail: customer.email || prev.customerEmail,
      phone: prev.phone || customer.phone || '',
      company: prev.company || customer.company || '',
      // Don't overwrite companyId if already set from a previous selection
      companyId: prev.companyId || null,
    }));
    setCustomerFound({ name: customer.name, company: customer.company || '' });
    setNameSuggestions([]);
    setShowNameSuggestions(false);
    setErrors((prev) => ({ ...prev, customerName: '', customerEmail: '' }));
  }

  function validate() {
    const next = { subject: '', customerEmail: '', customerName: '', company: '' };
    let ok = true;

    if (!form.company.trim()) {
      next.company = 'Company is required';
      ok = false;
    } else if (!form.companyId) {
      next.company = 'Select a company from the suggestions';
      ok = false;
    }

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

    if (!form.customerName.trim()) {
      next.customerName = 'Customer name is required';
      ok = false;
    } else if (!form.customerId) {
      next.customerName = 'Select a customer from the suggestions';
      ok = false;
    }

    setErrors(next);
    return ok;
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!validate() || isSubmitting) return;

    setIsSubmitting(true);
    try {
      // The API creates the ticket + initial message in a single transaction
      const newTicket = await addTicket({
        subject: form.subject.trim(),
        customerEmail: form.customerEmail.trim().toLowerCase(),
        customerName: form.customerName.trim() || undefined,
        customerId: form.customerId || undefined,
        phone: form.phone.trim() || undefined,
        company: form.company.trim() || undefined,
        companyId: form.companyId || undefined,
        category: form.category,
        priority: form.priority,
        initialMessage: form.initialMessage.trim() || undefined,
      });

      setSubmitted(true);
      addToast(`Ticket ${newTicket.id} created`, 'success');

      setTimeout(() => {
        onCreated?.(newTicket.id);
        onClose();
      }, 900);
    } catch {
      addToast('Failed to create ticket', 'error');
    } finally {
      setIsSubmitting(false);
    }
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
            {/* Company — required, full-width, first field */}
            <div className="form-group" style={{ position: 'relative' }}>
              <label htmlFor="new-company" className="form-label">
                Company <span className="required" aria-hidden="true">*</span>
              </label>
              <input
                id="new-company"
                type="text"
                className={`form-input${errors.company ? ' error' : ''}`}
                placeholder="e.g. Acme Corp"
                value={form.company}
                onChange={handleCompanyChange}
                onBlur={() => setTimeout(() => setShowSuggestions(false), 150)}
                autoComplete="off"
                aria-required="true"
                aria-describedby={errors.company ? 'company-error' : undefined}
                aria-invalid={!!errors.company}
              />
              {form.companyId && (
                <span className="ntf-company-linked">
                  <svg width="11" height="11" viewBox="0 0 11 11" fill="none" aria-hidden="true">
                    <circle cx="5.5" cy="5.5" r="4.5" fill="var(--brand-light)" stroke="var(--brand)" strokeWidth="1.2" />
                    <path d="M3 5.5l1.8 1.8L8 3.5" stroke="var(--brand)" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                  Linked to company record
                </span>
              )}
              {errors.company && (
                <span id="company-error" className="form-error" role="alert">
                  <svg width="11" height="11" viewBox="0 0 11 11" fill="none" aria-hidden="true">
                    <circle cx="5.5" cy="5.5" r="4.5" stroke="currentColor" strokeWidth="1.2" />
                    <path d="M5.5 3.5v2.5M5.5 7.5v.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
                  </svg>
                  {errors.company}
                </span>
              )}
              {showSuggestions && companySuggestions.length > 0 && (
                <ul className="ntf-suggest-list" role="listbox" aria-label="Company suggestions">
                  {companySuggestions.map((s) => (
                    <li
                      key={s.id}
                      className="ntf-suggest-item"
                      role="option"
                      onMouseDown={() => handleSelectSuggestion(s)}
                    >
                      <span className="ntf-suggest-name">{s.name}</span>
                      {s.primary_contact && (
                        <span className="ntf-suggest-meta">{s.primary_contact}</span>
                      )}
                      {s.address && (
                        <span className="ntf-suggest-meta">{s.address}</span>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {/* Customer name — required, with typeahead autocomplete */}
            <div className="form-group" style={{ position: 'relative' }}>
              <label htmlFor="new-name" className="form-label">
                Customer Name <span className="required" aria-hidden="true">*</span>
              </label>
              <input
                id="new-name"
                type="text"
                className={`form-input${errors.customerName ? ' error' : ''}`}
                placeholder="e.g. Jane Smith"
                value={form.customerName}
                onChange={handleNameChange}
                onBlur={() => setTimeout(() => setShowNameSuggestions(false), 150)}
                autoComplete="off"
                aria-required="true"
                aria-describedby={errors.customerName ? 'name-error' : undefined}
                aria-invalid={!!errors.customerName}
              />
              {errors.customerName && (
                <span id="name-error" className="form-error" role="alert">
                  <svg width="11" height="11" viewBox="0 0 11 11" fill="none" aria-hidden="true">
                    <circle cx="5.5" cy="5.5" r="4.5" stroke="currentColor" strokeWidth="1.2" />
                    <path d="M5.5 3.5v2.5M5.5 7.5v.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
                  </svg>
                  {errors.customerName}
                </span>
              )}
              {customerFound && (
                <span className="ntf-customer-found">
                  <svg width="11" height="11" viewBox="0 0 11 11" fill="none" aria-hidden="true">
                    <circle cx="5.5" cy="5.5" r="4.5" fill="var(--brand-light)" stroke="var(--brand)" strokeWidth="1.2" />
                    <path d="M3 5.5l1.8 1.8L8 3.5" stroke="var(--brand)" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                  Customer found — fields pre-filled from <strong>{customerFound.name}</strong>
                </span>
              )}
              {showNameSuggestions && nameSuggestions.length > 0 && (
                <ul className="ntf-suggest-list" role="listbox" aria-label="Customer suggestions">
                  {nameSuggestions.map((c) => (
                    <li
                      key={c.id}
                      className="ntf-suggest-item"
                      role="option"
                      onMouseDown={() => handleSelectNameSuggestion(c)}
                    >
                      <span className="ntf-suggest-name">{c.name}</span>
                      {c.email && (
                        <span className="ntf-suggest-meta">{c.email}</span>
                      )}
                    </li>
                  ))}
                </ul>
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
                onChange={handleEmailChange}
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

            {/* Phone */}
            <div className="form-group">
              <label htmlFor="new-phone" className="form-label">
                Phone
                <span style={{ fontWeight: 400, color: 'var(--gray-400)', marginLeft: 6 }}>(optional)</span>
              </label>
              <input
                id="new-phone"
                type="text"
                className="form-input"
                placeholder="e.g. +1 555 000 1234"
                value={form.phone}
                onChange={(e) => setField('phone', e.target.value)}
                autoComplete="tel"
              />
            </div>

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

            {/* Initial message */}
            <div className="form-group">
              <label htmlFor="new-initial-message" className="form-label">
                Initial Message
                <span style={{ fontWeight: 400, color: 'var(--gray-400)', marginLeft: 6 }}>(optional)</span>
              </label>
              <textarea
                id="new-initial-message"
                className="form-input"
                placeholder="Customer's opening message or issue description…"
                value={form.initialMessage}
                onChange={(e) => setField('initialMessage', e.target.value)}
                rows={3}
                style={{ resize: 'vertical', minHeight: 72, lineHeight: 1.55 }}
              />
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
