import { useState, useEffect, useCallback, useRef } from 'react';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { useSla } from '../context/SlaContext';
import { STATUS_LABELS } from '../utils/statusConfig';

// ── Helpers ───────────────────────────────────────────────

function getInitials(name) {
  return name.split(' ').filter(Boolean).map(n => n[0]).join('').toUpperCase().slice(0, 2);
}

function formatDate(iso) {
  return new Intl.DateTimeFormat(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  }).format(new Date(iso));
}

// ── CompanyDetailPage ─────────────────────────────────────
export function CompanyDetailPage({ company, onBack, onSelectTicket, onViewCustomer }) {
  const { addToast } = useToast();
  const { policies } = useSla();
  const [customers, setCustomers] = useState([]);
  const [tickets, setTickets] = useState([]);
  const [loading, setLoading] = useState(true);
  // Track current company data so SLA edits can update the header live
  const [companyData, setCompanyData] = useState(company);

  useEffect(() => {
    async function load() {
      try {
        const [custRes, tickRes] = await Promise.all([
          fetch(`/api/companies/${company.id}/customers`),
          fetch(`/api/companies/${company.id}/tickets`),
        ]);
        const [custData, tickData] = await Promise.all([custRes.json(), tickRes.json()]);
        if (!custRes.ok) throw new Error(custData.error || 'Failed to load customers');
        if (!tickRes.ok) throw new Error(tickData.error || 'Failed to load tickets');
        setCustomers(custData.customers);
        setTickets(tickData.tickets);
      } catch (err) {
        addToast(err.message, 'error');
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [company.id, addToast]);

  const openCount = tickets.filter(
    (t) => t.status !== 'resolved' && t.status !== 'closed'
  ).length;

  // Resolve the policy name from our loaded policies list (fresher than the
  // snapshot on the company prop, which may not have sla_policy_name set yet).
  const effectivePolicy = policies.find((p) => p.id === companyData.sla_policy_id)
    ?? policies.find((p) => p.is_default);
  const policyLabel = companyData.sla_policy_id
    ? (effectivePolicy?.name ?? 'Custom')
    : `${effectivePolicy?.name ?? 'Default'} (default)`;

  return (
    <div className="admin-page">
      <div className="admin-page-header">
        <div className="admin-page-header-inner">
          <div className="admin-page-header-row">
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <button className="btn-back" onClick={onBack}>&#8592; Back</button>
              <div>
                <h1 className="admin-page-title">{companyData.name}</h1>
                <p className="admin-page-subtitle">
                  {customers.length} customer{customers.length !== 1 ? 's' : ''} &middot; {tickets.length} ticket{tickets.length !== 1 ? 's' : ''} &middot; SLA: <strong>{policyLabel}</strong>
                </p>
              </div>
            </div>
            <div className="co-stat-pills">
              <span className="co-stat-pill">
                <span className="co-stat-pill-num">{customers.length}</span> Customers
              </span>
              <span className="co-stat-pill">
                <span className="co-stat-pill-num">{tickets.length}</span> Tickets
              </span>
              <span className={`co-stat-pill${openCount > 0 ? ' co-stat-pill--open' : ''}`}>
                <span className="co-stat-pill-num">{openCount}</span> Open
              </span>
            </div>
          </div>
        </div>
      </div>

      <div className="admin-page-body">
        {loading ? (
          <div className="admin-page-loading">Loading&hellip;</div>
        ) : (
          <div className="co-detail-sections">
            {/* Customers section */}
            <section className="co-detail-section">
              <h2 className="co-detail-section-title">Customers</h2>
              <div className="user-table-wrap">
                <table className="user-table">
                  <thead>
                    <tr>
                      <th>Name</th>
                      <th>Email</th>
                      <th>Phone</th>
                      <th>Tickets</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {customers.length === 0 ? (
                      <tr>
                        <td colSpan={5} className="user-table-empty">No customers for this company.</td>
                      </tr>
                    ) : (
                      customers.map((c) => (
                        <tr key={c.id}>
                          <td>{c.name}</td>
                          <td className="cust-table-email">{c.email}</td>
                          <td>{c.phone || <span className="cust-empty">&mdash;</span>}</td>
                          <td>
                            <span className={`cust-ticket-count${c.ticket_count > 0 ? ' cust-ticket-count--has' : ''}`}>
                              {c.ticket_count}
                            </span>
                          </td>
                          <td>
                            <button
                              className="btn-row-action"
                              onClick={() => onViewCustomer(c.email)}
                            >
                              View
                            </button>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </section>

            {/* Tickets section */}
            <section className="co-detail-section">
              <h2 className="co-detail-section-title">Tickets</h2>
              <div className="user-table-wrap">
                <table className="user-table cust-tickets-table">
                  <thead>
                    <tr>
                      <th>Ref</th>
                      <th>Subject</th>
                      <th>Customer</th>
                      <th>Status</th>
                      <th>Priority</th>
                      <th>Created</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {tickets.length === 0 ? (
                      <tr>
                        <td colSpan={7} className="user-table-empty">No tickets for this company.</td>
                      </tr>
                    ) : (
                      tickets.map((t) => (
                        <tr key={t.ticket_ref}>
                          <td className="cust-tickets-ref">{t.ticket_ref}</td>
                          <td className="cust-tickets-subject">{t.subject}</td>
                          <td>{t.customer_name || t.customer_email}</td>
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
                              onClick={() => onSelectTicket(t.ticket_ref)}
                            >
                              View
                            </button>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </section>
          </div>
        )}
      </div>
    </div>
  );
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

// ── AddCompanyModal ───────────────────────────────────────
function AddCompanyModal({ onClose, onCreated }) {
  const { addToast } = useToast();
  const { policies } = useSla();
  const [form, setForm] = useState({
    name: '',
    address: '',
    primary_contact: '',
    phone: '',
    sla_policy_id: '',
  });
  const [loading, setLoading] = useState(false);
  useEscapeKey(onClose);

  function set(field, value) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await fetch('/api/companies', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: form.name,
          address: form.address || null,
          primary_contact: form.primary_contact || null,
          phone: form.phone || null,
          sla_policy_id: form.sla_policy_id ? parseInt(form.sla_policy_id, 10) : null,
        }),
      });
      const data = await res.json();
      if (res.status === 409) {
        addToast('A company with that name already exists', 'error');
        return;
      }
      if (!res.ok) throw new Error(data.error || 'Failed to create company');
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
    <div className="modal-backdrop" role="dialog" aria-modal="true" aria-label="Add company">
      <div className="modal-card">
        <div className="modal-header">
          <h2 className="modal-title">Add Company</h2>
          <button className="modal-close" onClick={onClose} aria-label="Close">&#x2715;</button>
        </div>
        <form onSubmit={handleSubmit} className="modal-body">
          <div className="form-field">
            <label htmlFor="co-add-name">Name *</label>
            <input
              id="co-add-name"
              type="text"
              value={form.name}
              onChange={(e) => set('name', e.target.value)}
              required
              autoFocus
              placeholder="Acme Corp"
            />
          </div>
          <div className="form-field">
            <label htmlFor="co-add-address">Address</label>
            <textarea
              id="co-add-address"
              value={form.address}
              onChange={(e) => set('address', e.target.value)}
              rows={2}
              placeholder="123 Main St, Springfield, IL 62701"
            />
          </div>
          <div className="form-field">
            <label htmlFor="co-add-contact">Primary Contact</label>
            <input
              id="co-add-contact"
              type="text"
              value={form.primary_contact}
              onChange={(e) => set('primary_contact', e.target.value)}
              placeholder="Jane Smith"
            />
          </div>
          <div className="form-field">
            <label htmlFor="co-add-phone">Phone</label>
            <input
              id="co-add-phone"
              type="tel"
              value={form.phone}
              onChange={(e) => set('phone', e.target.value)}
              placeholder="+1 555 000 0000"
            />
          </div>
          <div className="form-field">
            <label htmlFor="co-add-sla">SLA Policy</label>
            <select
              id="co-add-sla"
              value={form.sla_policy_id}
              onChange={(e) => set('sla_policy_id', e.target.value)}
            >
              <option value="">Use default policy</option>
              {policies.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}{p.is_default ? ' (default)' : ''}
                </option>
              ))}
            </select>
          </div>
          <div className="modal-footer">
            <button type="button" className="btn-secondary" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn-primary" disabled={loading}>
              {loading ? 'Adding\u2026' : 'Add Company'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── EditCompanyModal ──────────────────────────────────────
function EditCompanyModal({ company, onClose, onUpdated }) {
  const { addToast } = useToast();
  const { policies } = useSla();
  const [form, setForm] = useState({
    name: company.name ?? '',
    address: company.address ?? '',
    primary_contact: company.primary_contact ?? '',
    phone: company.phone ?? '',
    sla_policy_id: company.sla_policy_id ?? '',
  });
  const [loading, setLoading] = useState(false);
  useEscapeKey(onClose);

  function set(field, value) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await fetch(`/api/companies/${company.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: form.name,
          address: form.address || null,
          primary_contact: form.primary_contact || null,
          phone: form.phone || null,
          sla_policy_id: form.sla_policy_id ? parseInt(form.sla_policy_id, 10) : null,
        }),
      });
      const data = await res.json();
      if (res.status === 409) {
        addToast('A company with that name already exists', 'error');
        return;
      }
      if (!res.ok) throw new Error(data.error || 'Failed to update company');
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
    <div className="modal-backdrop" role="dialog" aria-modal="true" aria-label="Edit company">
      <div className="modal-card">
        <div className="modal-header">
          <h2 className="modal-title">Edit Company</h2>
          <button className="modal-close" onClick={onClose} aria-label="Close">&#x2715;</button>
        </div>
        <form onSubmit={handleSubmit} className="modal-body">
          <div className="form-field">
            <label htmlFor="co-edit-name">Name *</label>
            <input
              id="co-edit-name"
              type="text"
              value={form.name}
              onChange={(e) => set('name', e.target.value)}
              required
              autoFocus
              placeholder="Acme Corp"
            />
          </div>
          <div className="form-field">
            <label htmlFor="co-edit-address">Address</label>
            <textarea
              id="co-edit-address"
              value={form.address}
              onChange={(e) => set('address', e.target.value)}
              rows={2}
              placeholder="123 Main St, Springfield, IL 62701"
            />
          </div>
          <div className="form-field">
            <label htmlFor="co-edit-contact">Primary Contact</label>
            <input
              id="co-edit-contact"
              type="text"
              value={form.primary_contact}
              onChange={(e) => set('primary_contact', e.target.value)}
              placeholder="Jane Smith"
            />
          </div>
          <div className="form-field">
            <label htmlFor="co-edit-phone">Phone</label>
            <input
              id="co-edit-phone"
              type="tel"
              value={form.phone}
              onChange={(e) => set('phone', e.target.value)}
              placeholder="+1 555 000 0000"
            />
          </div>
          <div className="form-field">
            <label htmlFor="co-edit-sla">SLA Policy</label>
            <select
              id="co-edit-sla"
              value={form.sla_policy_id}
              onChange={(e) => set('sla_policy_id', e.target.value)}
            >
              <option value="">Use default policy</option>
              {policies.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}{p.is_default ? ' (default)' : ''}
                </option>
              ))}
            </select>
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

// ── CompaniesPage ─────────────────────────────────────────
export default function CompaniesPage({ onSelectCompany, onSelectTicket }) {
  const { addToast } = useToast();
  const { user } = useAuth();
  const { policies } = useSla();
  const isAdmin = user?.role === 'admin';

  const [companies, setCompanies] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [total, setTotal] = useState(0);
  const [showAdd, setShowAdd] = useState(false);
  const [editingCompany, setEditingCompany] = useState(null);
  const debounceRef = useRef(null);

  const fetchCompanies = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (search) params.set('search', search);
      const res = await fetch(`/api/companies?${params}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to load companies');
      setCompanies(data.companies);
      setTotal(data.total);
    } catch (err) {
      addToast(err.message, 'error');
    } finally {
      setLoading(false);
    }
  }, [search, addToast]);

  useEffect(() => {
    fetchCompanies();
  }, [fetchCompanies]);

  function handleSearchChange(e) {
    const val = e.target.value;
    setSearchInput(val);
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setSearch(val);
    }, 350);
  }

  function handleCreated(newCompany) {
    setCompanies((prev) => [
      { ...newCompany, customer_count: 0, ticket_count: 0, open_ticket_count: 0 },
      ...prev,
    ]);
    setTotal((t) => t + 1);
  }

  function handleUpdated(updatedCompany) {
    setCompanies((prev) =>
      prev.map((c) => (c.id === updatedCompany.id ? { ...c, ...updatedCompany } : c))
    );
  }

  async function handleDelete(row, setDeleteState) {
    try {
      const res = await fetch(`/api/companies/${row.id}`, { method: 'DELETE' });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to delete company');
      }
      setCompanies((prev) => prev.filter((c) => c.id !== row.id));
      setTotal((t) => t - 1);
      addToast(`${row.name} deleted`, 'success');
    } catch (err) {
      addToast(err.message, 'error');
      setDeleteState('idle');
    }
  }

  return (
    <div className="admin-page">
      <div className="admin-page-header">
        <div className="admin-page-header-inner">
          <div className="admin-page-header-row">
            <div>
              <h1 className="admin-page-title">Companies</h1>
              <p className="admin-page-subtitle">
                {total > 0 ? `${total} company${total !== 1 ? 's' : ''}` : 'Track your client companies.'}
              </p>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
              {!loading && total > 0 && (
                <div className="page-stat-chips">
                  <span className="page-stat-chip page-stat-chip--brand">
                    <span className="page-stat-chip-num">{total}</span> {total === 1 ? 'Company' : 'Companies'}
                  </span>
                </div>
              )}
              <button className="btn btn-primary" onClick={() => setShowAdd(true)}>
                + Add Company
              </button>
            </div>
          </div>

          <div className="cust-search-row">
            <div className="cust-search-wrap">
              <svg className="cust-search-icon" width="15" height="15" viewBox="0 0 12 12" fill="none" aria-hidden="true">
                <circle cx="5" cy="5" r="3.5" stroke="currentColor" strokeWidth="1.4" />
                <path d="M8 8l2.5 2.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
              </svg>
              <input
                className="cust-search cust-search--icon"
                type="search"
                value={searchInput}
                onChange={handleSearchChange}
                placeholder="Search companies&hellip;"
                aria-label="Search companies"
              />
            </div>
          </div>
        </div>
      </div>

      <div className="admin-page-body">
        {loading ? (
          <div className="admin-page-loading">Loading companies&hellip;</div>
        ) : (
          <div className="user-table-wrap">
            <table className="user-table">
              <thead>
                <tr>
                  <th>Company</th>
                  <th>Address</th>
                  <th>Primary Contact</th>
                  <th>Phone</th>
                  <th>SLA Policy</th>
                  <th>Customers</th>
                  <th>Open Tickets</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {companies.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="user-table-empty">
                      {search ? `No companies matching "${search}".` : 'No companies found.'}
                    </td>
                  </tr>
                ) : (
                  companies.map((row) => (
                    <CompanyRow
                      key={row.id}
                      row={row}
                      isAdmin={isAdmin}
                      onSelectCompany={onSelectCompany}
                      onEdit={() => setEditingCompany(row)}
                      onDelete={handleDelete}
                      defaultPolicyName={policies.find((p) => p.is_default)?.name}
                    />
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {showAdd && (
        <AddCompanyModal
          onClose={() => setShowAdd(false)}
          onCreated={handleCreated}
        />
      )}

      {editingCompany && (
        <EditCompanyModal
          company={editingCompany}
          onClose={() => setEditingCompany(null)}
          onUpdated={(updated) => {
            handleUpdated(updated);
            setEditingCompany(null);
          }}
        />
      )}
    </div>
  );
}

// ── CompanyRow ────────────────────────────────────────────
function CompanyRow({ row, isAdmin, onSelectCompany, onEdit, onDelete, defaultPolicyName }) {
  const [deleteState, setDeleteState] = useState('idle'); // 'idle' | 'confirming'

  const addressDisplay = row.address
    ? row.address.length > 40
      ? row.address.slice(0, 40) + '\u2026'
      : row.address
    : '\u2014';

  return (
    <tr>
      <td>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span className="item-avatar item-avatar--company" aria-hidden="true">{getInitials(row.name)}</span>
          <span style={{ fontWeight: 600, color: 'var(--gray-800)' }}>{row.name}</span>
        </div>
      </td>
      <td style={{ color: 'var(--gray-500)', fontSize: '0.8125rem' }}>{addressDisplay}</td>
      <td style={{ color: 'var(--gray-600)' }}>{row.primary_contact || <span className="cust-empty">&mdash;</span>}</td>
      <td style={{ color: 'var(--gray-600)' }}>{row.phone || <span className="cust-empty">&mdash;</span>}</td>
      <td>
        {row.sla_policy_id ? (
          <span className="co-sla-badge co-sla-badge--custom">{row.sla_policy_name ?? 'Custom'}</span>
        ) : (
          <span className="co-sla-badge co-sla-badge--default">{defaultPolicyName ?? 'Default'}</span>
        )}
      </td>
      <td>
        <span className={`cust-ticket-count${row.customer_count > 0 ? ' cust-ticket-count--has' : ''}`}>
          {row.customer_count}
        </span>
      </td>
      <td>
        {row.open_ticket_count > 0 ? (
          <span style={{ color: '#c2410c', fontWeight: 600 }}>{row.open_ticket_count}</span>
        ) : (
          <span style={{ color: 'var(--gray-400)' }}>0</span>
        )}
      </td>
      <td>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          <button
            className="btn-row-action"
            onClick={() => onSelectCompany(row)}
          >
            View
          </button>
          <button
            className="btn-row-action"
            onClick={onEdit}
          >
            Edit
          </button>
          {isAdmin && deleteState === 'idle' && (
            <button
              className="btn-row-action btn-row-action--danger"
              onClick={() => setDeleteState('confirming')}
            >
              Delete
            </button>
          )}
          {isAdmin && deleteState === 'confirming' && (
            <div className="user-delete-confirm">
              <span className="user-delete-confirm-text">Delete {row.name}?</span>
              <button
                className="btn-action-cancel"
                onClick={() => setDeleteState('idle')}
              >
                Cancel
              </button>
              <button
                className="btn-action-danger"
                onClick={() => onDelete(row, setDeleteState)}
              >
                Confirm Delete
              </button>
            </div>
          )}
        </div>
      </td>
    </tr>
  );
}
