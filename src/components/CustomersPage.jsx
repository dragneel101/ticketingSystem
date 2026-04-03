import { useState, useEffect, useCallback, useRef } from 'react';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { STATUS_LABELS } from '../utils/statusConfig';

// ── Helpers ───────────────────────────────────────────────

function formatDate(iso) {
  return new Intl.DateTimeFormat(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  }).format(new Date(iso));
}

// ── Escape key hook ───────────────────────────────────────
function useEscapeKey(handler) {
  useEffect(() => {
    function onKeyDown(e) {
      if (e.key === 'Escape') handler();
    }
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [handler]);
}

// ── CustomerTicketsModal ──────────────────────────────────
function CustomerTicketsModal({ customer, onClose, onSelectTicket }) {
  const [tickets, setTickets] = useState([]);
  const [loading, setLoading] = useState(true);
  const { addToast } = useToast();
  useEscapeKey(onClose);

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch(`/api/customers/${customer.id}/tickets`);
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Failed to load tickets');
        setTickets(data);
      } catch (err) {
        addToast(err.message, 'error');
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [customer.id, addToast]);

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true" aria-label={`Tickets for ${customer.name}`}>
      <div className="modal-card cust-tickets-modal">
        <div className="modal-header">
          <div>
            <h2 className="modal-title">{customer.name}</h2>
            <p style={{ margin: 0, fontSize: '0.8125rem', color: 'var(--gray-400)' }}>{customer.email}</p>
          </div>
          <button className="modal-close" onClick={onClose} aria-label="Close">&#x2715;</button>
        </div>
        <div className="modal-body cust-tickets-body">
          {loading ? (
            <p className="cust-tickets-empty">Loading&hellip;</p>
          ) : tickets.length === 0 ? (
            <p className="cust-tickets-empty">No tickets for this customer yet.</p>
          ) : (
            <table className="cust-tickets-table">
              <thead>
                <tr>
                  <th>Ref</th>
                  <th>Subject</th>
                  <th>Status</th>
                  <th>Priority</th>
                  <th>Created</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {tickets.map((t) => (
                  <tr key={t.ticket_ref}>
                    <td className="cust-tickets-ref">{t.ticket_ref}</td>
                    <td className="cust-tickets-subject">{t.subject}</td>
                    <td>
                      <span className={`cust-tickets-status cust-tickets-status--${t.status}`}>
                        {STATUS_LABELS[t.status] ?? t.status}
                      </span>
                    </td>
                    <td className={`cust-tickets-priority cust-tickets-priority--${t.priority}`}>
                      {t.priority.charAt(0).toUpperCase() + t.priority.slice(1)}
                    </td>
                    <td className="cust-tickets-date">{formatDate(t.created_at)}</td>
                    <td>
                      <button
                        className="btn-row-action"
                        onClick={() => { onSelectTicket(t.ticket_ref); onClose(); }}
                      >
                        View
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}

// ── AddCustomerModal ──────────────────────────────────────
// Inline in the same file — it's tightly coupled to CustomersPage and
// not reused elsewhere, so a separate file would just add nav overhead.
function AddCustomerModal({ onClose, onCreated }) {
  const { addToast } = useToast();
  const [form, setForm] = useState({
    name: '',
    email: '',
    phone: '',
    company: '',
    companyId: null,
    notes: '',
  });
  const [loading, setLoading] = useState(false);
  useEscapeKey(onClose);
  const [companyError, setCompanyError] = useState('');
  const [companySuggestions, setCompanySuggestions] = useState([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const suggestTimerRef = useRef(null);

  function set(field, value) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  function handleCompanyChange(val) {
    set('company', val);
    set('companyId', null);
    setCompanyError('');
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
        } catch { /* silently ignore */ }
      }, 300);
    } else {
      setCompanySuggestions([]);
    }
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!form.company?.trim()) { setCompanyError('Company is required'); return; }
    if (!form.companyId) { setCompanyError('Select a company from the suggestions'); return; }
    setCompanyError('');
    setLoading(true);
    try {
      const res = await fetch('/api/customers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: form.name,
          email: form.email,
          phone: form.phone || null,
          company: form.company || null,
          company_id: form.companyId || null,
          notes: form.notes || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to create customer');
      addToast(`${data.name} added`, 'success');
      onCreated(data);
      onClose();
    } catch (err) {
      addToast(err.message, 'error');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true" aria-label="Add customer">
      <div className="modal-card">
        <div className="modal-header">
          <h2 className="modal-title">Add Customer</h2>
          <button className="modal-close" onClick={onClose} aria-label="Close">&#x2715;</button>
        </div>
        <form onSubmit={handleSubmit} className="modal-body">
          <div className="form-field">
            <label htmlFor="cust-add-name">Name *</label>
            <input
              id="cust-add-name"
              type="text"
              value={form.name}
              onChange={(e) => set('name', e.target.value)}
              required
              autoFocus
              placeholder="Jane Smith"
            />
          </div>
          <div className="form-field">
            <label htmlFor="cust-add-email">Email *</label>
            <input
              id="cust-add-email"
              type="email"
              value={form.email}
              onChange={(e) => set('email', e.target.value)}
              required
              placeholder="jane@example.com"
            />
          </div>
          <div className="form-field">
            <label htmlFor="cust-add-phone">Phone</label>
            <input
              id="cust-add-phone"
              type="tel"
              value={form.phone}
              onChange={(e) => set('phone', e.target.value)}
              placeholder="+1 555 000 0000"
            />
          </div>
          <div className="form-field" style={{ position: 'relative' }}>
            <label htmlFor="cust-add-company">Company *</label>
            <input
              id="cust-add-company"
              type="text"
              value={form.company}
              onChange={(e) => handleCompanyChange(e.target.value)}
              onBlur={() => setTimeout(() => setShowSuggestions(false), 150)}
              placeholder="Acme Corp"
              autoComplete="off"
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
            {companyError && (
              <span className="form-error" role="alert">
                <svg width="11" height="11" viewBox="0 0 11 11" fill="none" aria-hidden="true">
                  <circle cx="5.5" cy="5.5" r="4.5" stroke="currentColor" strokeWidth="1.2" />
                  <path d="M5.5 3.5v2.5M5.5 7.5v.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
                </svg>
                {companyError}
              </span>
            )}
            {showSuggestions && companySuggestions.length > 0 && (
              <ul className="ntf-suggest-list" role="listbox" aria-label="Company suggestions">
                {companySuggestions.map((s) => (
                  <li
                    key={s.id}
                    className="ntf-suggest-item"
                    role="option"
                    onMouseDown={() => {
                      set('company', s.name);
                      set('companyId', s.id);
                      setCompanyError('');
                      setCompanySuggestions([]);
                      setShowSuggestions(false);
                    }}
                  >
                    <span className="ntf-suggest-name">{s.name}</span>
                    {s.primary_contact && <span className="ntf-suggest-meta">{s.primary_contact}</span>}
                    {s.address && <span className="ntf-suggest-meta">{s.address}</span>}
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div className="form-field">
            <label htmlFor="cust-add-notes">Notes</label>
            <textarea
              id="cust-add-notes"
              value={form.notes}
              onChange={(e) => set('notes', e.target.value)}
              rows={3}
              placeholder="Any context about this customer..."
            />
          </div>
          <div className="modal-footer">
            <button type="button" className="btn-secondary" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn-primary" disabled={loading}>
              {loading ? 'Adding\u2026' : 'Add Customer'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── EditCustomerModal ─────────────────────────────────────
function EditCustomerModal({ customer, onClose, onUpdated }) {
  const { addToast } = useToast();
  const [form, setForm] = useState({
    name: customer.name ?? '',
    email: customer.email ?? '',
    phone: customer.phone ?? '',
    company: customer.company ?? '',
    companyId: customer.company_id ?? null,
    notes: customer.notes ?? '',
  });
  const [loading, setLoading] = useState(false);
  useEscapeKey(onClose);
  const [companyError, setCompanyError] = useState('');
  const [companySuggestions, setCompanySuggestions] = useState([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const suggestTimerRef = useRef(null);

  function set(field, value) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  function handleCompanyChange(val) {
    set('company', val);
    set('companyId', null);
    setCompanyError('');
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
        } catch { /* silently ignore */ }
      }, 300);
    } else {
      setCompanySuggestions([]);
    }
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!form.company?.trim()) { setCompanyError('Company is required'); return; }
    if (!form.companyId) { setCompanyError('Select a company from the suggestions'); return; }
    setCompanyError('');
    setLoading(true);
    try {
      const res = await fetch(`/api/customers/${customer.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: form.name,
          email: form.email,
          // Send null explicitly for cleared optional fields so the server
          // stores NULL in the DB rather than an empty string
          phone: form.phone || null,
          company: form.company || null,
          company_id: form.companyId ?? null,
          notes: form.notes || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to update customer');
      addToast(`${data.name} updated`, 'success');
      onUpdated(data);
      onClose();
    } catch (err) {
      addToast(err.message, 'error');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true" aria-label="Edit customer">
      <div className="modal-card">
        <div className="modal-header">
          <h2 className="modal-title">Edit Customer</h2>
          <button className="modal-close" onClick={onClose} aria-label="Close">&#x2715;</button>
        </div>
        <form onSubmit={handleSubmit} className="modal-body">
          <div className="form-field">
            <label htmlFor="cust-edit-name">Name *</label>
            <input
              id="cust-edit-name"
              type="text"
              value={form.name}
              onChange={(e) => set('name', e.target.value)}
              required
              autoFocus
            />
          </div>
          <div className="form-field">
            <label htmlFor="cust-edit-email">Email *</label>
            <input
              id="cust-edit-email"
              type="email"
              value={form.email}
              onChange={(e) => set('email', e.target.value)}
              required
            />
          </div>
          <div className="form-field">
            <label htmlFor="cust-edit-phone">Phone</label>
            <input
              id="cust-edit-phone"
              type="tel"
              value={form.phone}
              onChange={(e) => set('phone', e.target.value)}
            />
          </div>
          <div className="form-field" style={{ position: 'relative' }}>
            <label htmlFor="cust-edit-company">Company *</label>
            <input
              id="cust-edit-company"
              type="text"
              value={form.company}
              onChange={(e) => handleCompanyChange(e.target.value)}
              onBlur={() => setTimeout(() => setShowSuggestions(false), 150)}
              placeholder="Acme Corp"
              autoComplete="off"
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
            {companyError && (
              <span className="form-error" role="alert">
                <svg width="11" height="11" viewBox="0 0 11 11" fill="none" aria-hidden="true">
                  <circle cx="5.5" cy="5.5" r="4.5" stroke="currentColor" strokeWidth="1.2" />
                  <path d="M5.5 3.5v2.5M5.5 7.5v.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
                </svg>
                {companyError}
              </span>
            )}
            {showSuggestions && companySuggestions.length > 0 && (
              <ul className="ntf-suggest-list" role="listbox" aria-label="Company suggestions">
                {companySuggestions.map((s) => (
                  <li
                    key={s.id}
                    className="ntf-suggest-item"
                    role="option"
                    onMouseDown={() => {
                      set('company', s.name);
                      set('companyId', s.id);
                      setCompanyError('');
                      setCompanySuggestions([]);
                      setShowSuggestions(false);
                    }}
                  >
                    <span className="ntf-suggest-name">{s.name}</span>
                    {s.primary_contact && <span className="ntf-suggest-meta">{s.primary_contact}</span>}
                    {s.address && <span className="ntf-suggest-meta">{s.address}</span>}
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div className="form-field">
            <label htmlFor="cust-edit-notes">Notes</label>
            <textarea
              id="cust-edit-notes"
              value={form.notes}
              onChange={(e) => set('notes', e.target.value)}
              rows={3}
            />
          </div>
          <div className="modal-footer">
            <button type="button" className="btn-secondary" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn-primary" disabled={loading}>
              {loading ? 'Saving\u2026' : 'Save Changes'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── CustomerRow ───────────────────────────────────────────
// Self-contained row component — owns its delete confirmation state
// and the edit modal, matching the pattern from UserManagementPage.
function CustomerRow({ customer, isAdmin, onUpdated, onDeleted, onSelectTicket }) {
  const { addToast } = useToast();
  const [deleteState, setDeleteState] = useState('idle');
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [showEdit, setShowEdit] = useState(false);
  const [showTickets, setShowTickets] = useState(false);

  async function handleDelete() {
    setDeleteLoading(true);
    try {
      const res = await fetch(`/api/customers/${customer.id}`, { method: 'DELETE' });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to delete customer');
      }
      addToast(`${customer.name} deleted`, 'success');
      onDeleted(customer.id);
    } catch (err) {
      addToast(err.message, 'error');
      setDeleteState('idle');
    } finally {
      setDeleteLoading(false);
    }
  }

  return (
    <>
      <tr>
        <td className="cust-table-name">{customer.name}</td>
        <td className="cust-table-email">{customer.email}</td>
        <td className="cust-table-phone">{customer.phone || <span className="cust-empty">—</span>}</td>
        <td className="cust-table-company">{customer.company || <span className="cust-empty">—</span>}</td>
        <td className="cust-table-count">
          {/* Ticket count badge — gives agents a quick signal of how active this customer is */}
          <span className={`cust-ticket-count${customer.ticket_count > 0 ? ' cust-ticket-count--has' : ''}`}>
            {customer.ticket_count}
          </span>
        </td>
        <td className="cust-table-date">{formatDate(customer.created_at)}</td>
        <td className="cust-table-actions">
          {deleteState === 'confirming' ? (
            <div className="user-delete-confirm">
              <span className="user-delete-confirm-text">Delete {customer.name}?</span>
              <button
                className="btn-action-cancel"
                onClick={() => setDeleteState('idle')}
                disabled={deleteLoading}
              >
                Cancel
              </button>
              <button
                className="btn-action-danger"
                onClick={handleDelete}
                disabled={deleteLoading}
              >
                {deleteLoading ? 'Deleting\u2026' : 'Confirm Delete'}
              </button>
            </div>
          ) : (
            <div className="user-row-actions">
              <button
                className="btn-row-action"
                onClick={() => setShowTickets(true)}
                aria-label={`View tickets for ${customer.name}`}
              >
                Tickets
              </button>
              <button
                className="btn-row-action"
                onClick={() => setShowEdit(true)}
                aria-label={`Edit ${customer.name}`}
              >
                Edit
              </button>
              {isAdmin && (
                <button
                  className="btn-row-action btn-row-action--danger"
                  onClick={() => setDeleteState('confirming')}
                  aria-label={`Delete ${customer.name}`}
                >
                  Delete
                </button>
              )}
            </div>
          )}
        </td>
      </tr>

      {showEdit && (
        <EditCustomerModal
          customer={customer}
          onClose={() => setShowEdit(false)}
          onUpdated={(updated) => {
            onUpdated(updated);
            setShowEdit(false);
          }}
        />
      )}

      {showTickets && (
        <CustomerTicketsModal
          customer={customer}
          onClose={() => setShowTickets(false)}
          onSelectTicket={onSelectTicket}
        />
      )}
    </>
  );
}

// ── CustomersPage ─────────────────────────────────────────
export default function CustomersPage({ onSelectTicket, initialSearch = '' }) {
  const { user } = useAuth();
  const { addToast } = useToast();
  const isAdmin = user?.role === 'admin';

  const [customers, setCustomers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);

  // Pagination state
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);

  // Seed search from initialSearch (e.g. navigating here from a ticket's customer card).
  const [searchInput, setSearchInput] = useState(initialSearch);
  const [search, setSearch] = useState(initialSearch);
  const debounceRef = useRef(null);

  // Fetch the customer list whenever page or search changes.
  // useCallback with [page, search] as deps means fetchCustomers is stable
  // between renders unless one of those values changes — this avoids the
  // infinite-loop trap of listing fetchCustomers itself as a useEffect dep.
  const fetchCustomers = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page, limit: 20 });
      if (search) params.set('search', search);

      const res = await fetch(`/api/customers?${params}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to load customers');

      setCustomers(data.customers);
      setTotalPages(data.totalPages);
      setTotal(data.total);
    } catch (err) {
      addToast(err.message, 'error');
    } finally {
      setLoading(false);
    }
  }, [page, search, addToast]);

  useEffect(() => {
    fetchCustomers();
  }, [fetchCustomers]);

  // Debounce the search input: wait 350ms after the user stops typing before
  // committing the search term. This prevents a request on every keystroke.
  // The cleanup function cancels the pending timer when the component unmounts
  // or the input changes before the delay expires — no stale fetch.
  function handleSearchChange(e) {
    const val = e.target.value;
    setSearchInput(val);
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setPage(1); // reset to first page on new search
      setSearch(val);
    }, 350);
  }

  const handleCustomerCreated = useCallback((newCustomer) => {
    // Prepend the new customer and shift the last one off to maintain page size.
    // If we're not on page 1, a re-fetch would be more correct — but prepending
    // is the snappier UX and the user can see their new record immediately.
    setCustomers((prev) => [newCustomer, ...prev]);
    setTotal((t) => t + 1);
  }, []);

  // Optimistic update: replace the edited customer in-place by id.
  // Array.map returns a new array, which triggers React's re-render.
  const handleCustomerUpdated = useCallback((updated) => {
    setCustomers((prev) => prev.map((c) => (c.id === updated.id ? { ...c, ...updated } : c)));
  }, []);

  // Optimistic removal: filter out the deleted customer by id.
  const handleCustomerDeleted = useCallback((deletedId) => {
    setCustomers((prev) => prev.filter((c) => c.id !== deletedId));
    setTotal((t) => t - 1);
  }, []);

  return (
    <div className="admin-page">
      <div className="admin-page-header">
        <div className="admin-page-header-inner">
          <div className="admin-page-header-row">
            <div>
              <h1 className="admin-page-title">Customers</h1>
              <p className="admin-page-subtitle">
                {total > 0 ? `${total} customer${total !== 1 ? 's' : ''}` : 'Manage your customer contacts.'}
              </p>
            </div>
            {/* Add Customer is available to all authenticated users —
                agents may need to create a customer record before filing a ticket */}
            <button className="btn btn-primary" onClick={() => setShowAdd(true)}>
              + Add Customer
            </button>
          </div>

          {/* Search bar — lives in the header so it's always visible */}
          <div className="cust-search-row">
            <div className="cust-search-wrap">
              <svg className="cust-search-icon" width="13" height="13" viewBox="0 0 12 12" fill="none" aria-hidden="true">
                <circle cx="5" cy="5" r="3.5" stroke="currentColor" strokeWidth="1.4" />
                <path d="M8 8l2.5 2.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
              </svg>
              <input
                className="cust-search cust-search--icon"
                type="search"
                value={searchInput}
                onChange={handleSearchChange}
                placeholder="Search by name, email, or company..."
                aria-label="Search customers"
              />
            </div>
          </div>
        </div>
      </div>

      <div className="admin-page-body">
        {loading ? (
          <div className="admin-page-loading">Loading customers&hellip;</div>
        ) : (
          <>
            <div className="user-table-wrap">
              <table className="user-table cust-table">
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Email</th>
                    <th>Phone</th>
                    <th>Company</th>
                    <th>Tickets</th>
                    <th>Added</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {customers.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="user-table-empty">
                        {search ? `No customers matching "${search}".` : 'No customers yet.'}
                      </td>
                    </tr>
                  ) : (
                    customers.map((c) => (
                      <CustomerRow
                        key={c.id}
                        customer={c}
                        isAdmin={isAdmin}
                        onUpdated={handleCustomerUpdated}
                        onDeleted={handleCustomerDeleted}
                        onSelectTicket={onSelectTicket}
                      />
                    ))
                  )}
                </tbody>
              </table>
            </div>

            {/* Pagination — only render when there's more than one page */}
            {totalPages > 1 && (
              <div className="cust-pagination">
                <button
                  className="cust-page-btn"
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page === 1}
                >
                  Previous
                </button>
                <span className="cust-page-info">
                  Page {page} of {totalPages}
                </span>
                <button
                  className="cust-page-btn"
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={page === totalPages}
                >
                  Next
                </button>
              </div>
            )}
          </>
        )}
      </div>

      {showAdd && (
        <AddCustomerModal
          onClose={() => setShowAdd(false)}
          onCreated={handleCustomerCreated}
        />
      )}
    </div>
  );
}
