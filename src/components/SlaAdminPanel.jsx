import { useState } from 'react';
import { useSla } from '../context/SlaContext';
import { useToast } from '../context/ToastContext';

const PRIORITIES = ['low', 'medium', 'high', 'urgent'];

const EMPTY_FORM = {
  name: '',
  response_low_minutes: '', response_medium_minutes: '',
  response_high_minutes: '', response_urgent_minutes: '',
  resolution_low_minutes: '', resolution_medium_minutes: '',
  resolution_high_minutes: '', resolution_urgent_minutes: '',
  is_default: false,
};

export default function SlaAdminPanel() {
  const { policies, loading, createPolicy, updatePolicy, deletePolicy, setDefaultPolicy } = useSla();
  const { addToast } = useToast();

  const [showForm, setShowForm]     = useState(false);
  const [editingId, setEditingId]   = useState(null);
  const [form, setForm]             = useState(EMPTY_FORM);
  const [saving, setSaving]         = useState(false);
  const [deletingId, setDeletingId] = useState(null);
  const [confirmDelete, setConfirmDelete] = useState(null); // policy id pending confirmation

  function openCreate() {
    setEditingId(null);
    setForm(EMPTY_FORM);
    setShowForm(true);
  }

  function openEdit(policy) {
    setEditingId(policy.id);
    setForm({
      name: policy.name,
      response_low_minutes:      policy.response_low_minutes      ?? '',
      response_medium_minutes:   policy.response_medium_minutes   ?? '',
      response_high_minutes:     policy.response_high_minutes     ?? '',
      response_urgent_minutes:   policy.response_urgent_minutes   ?? '',
      resolution_low_minutes:    policy.resolution_low_minutes    ?? '',
      resolution_medium_minutes: policy.resolution_medium_minutes ?? '',
      resolution_high_minutes:   policy.resolution_high_minutes   ?? '',
      resolution_urgent_minutes: policy.resolution_urgent_minutes ?? '',
      is_default: policy.is_default,
    });
    setShowForm(true);
  }

  function cancelForm() {
    setShowForm(false);
    setEditingId(null);
    setForm(EMPTY_FORM);
  }

  function handleField(key, value) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!form.name.trim()) return;
    setSaving(true);
    try {
      const payload = {
        name: form.name.trim(),
        is_default: form.is_default,
      };
      for (const p of PRIORITIES) {
        payload[`response_${p}_minutes`]   = form[`response_${p}_minutes`]   === '' ? null : Number(form[`response_${p}_minutes`]);
        payload[`resolution_${p}_minutes`] = form[`resolution_${p}_minutes`] === '' ? null : Number(form[`resolution_${p}_minutes`]);
      }

      if (editingId) {
        await updatePolicy(editingId, payload);
        addToast('SLA policy updated', 'success');
      } else {
        await createPolicy(payload);
        addToast('SLA policy created', 'success');
      }
      cancelForm();
    } catch (err) {
      addToast(err.message || 'Failed to save policy', 'error');
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id) {
    if (confirmDelete !== id) {
      setConfirmDelete(id);
      return;
    }
    setDeletingId(id);
    setConfirmDelete(null);
    try {
      await deletePolicy(id);
      addToast('SLA policy deleted', 'success');
    } catch (err) {
      addToast(err.message || 'Failed to delete policy', 'error');
    } finally {
      setDeletingId(null);
    }
  }

  async function handleSetDefault(id) {
    try {
      await setDefaultPolicy(id);
      addToast('Default SLA policy updated', 'success');
    } catch (err) {
      addToast(err.message || 'Failed to set default', 'error');
    }
  }

  if (loading) return <p className="settings-loading">Loading SLA policies…</p>;

  return (
    <div className="sla-admin-panel">
      {/* ── Policy table ── */}
      {policies.length > 0 && (
        <div className="sla-table-wrap">
          <table className="sla-table">
            <thead>
              <tr>
                <th>Name</th>
                {PRIORITIES.map((p) => (
                  <th key={p} style={{ textAlign: 'center', textTransform: 'capitalize' }}>
                    {p}
                    <div style={{ fontSize: 10, fontWeight: 400, color: 'var(--gray-400)' }}>R / Res</div>
                  </th>
                ))}
                <th>Default</th>
                <th style={{ textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {policies.map((pol) => (
                <tr key={pol.id} className={pol.is_default ? 'sla-row--default' : ''}>
                  <td className="sla-td-name">{pol.name}</td>
                  {PRIORITIES.map((p) => (
                    <td key={p} style={{ textAlign: 'center', fontSize: 12 }}>
                      {fmtMin(pol[`response_${p}_minutes`])} / {fmtMin(pol[`resolution_${p}_minutes`])}
                    </td>
                  ))}
                  <td style={{ textAlign: 'center' }}>
                    {pol.is_default ? (
                      <span className="sla-badge-default">Default</span>
                    ) : (
                      <button
                        className="sla-btn-link"
                        onClick={() => handleSetDefault(pol.id)}
                      >
                        Set default
                      </button>
                    )}
                  </td>
                  <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                    <button className="sla-btn-link" onClick={() => openEdit(pol)}>Edit</button>
                    {!pol.is_default && (
                      <button
                        className={`sla-btn-link sla-btn-danger${confirmDelete === pol.id ? ' sla-btn-danger--confirm' : ''}`}
                        onClick={() => handleDelete(pol.id)}
                        disabled={deletingId === pol.id}
                      >
                        {confirmDelete === pol.id ? 'Confirm?' : 'Delete'}
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {policies.length === 0 && !showForm && (
        <p className="sla-empty-msg">No SLA policies yet. Create one to start tracking SLA deadlines.</p>
      )}

      {/* ── Add button ── */}
      {!showForm && (
        <button className="btn btn--sm btn--brand sla-add-btn" onClick={openCreate}>
          + Add SLA Policy
        </button>
      )}

      {/* ── Create / Edit form ── */}
      {showForm && (
        <form className="sla-form" onSubmit={handleSubmit}>
          <h3 className="sla-form-title">{editingId ? 'Edit SLA Policy' : 'New SLA Policy'}</h3>

          <div className="sla-form-row">
            <label className="sla-form-label" htmlFor="sla-name">Policy Name</label>
            <input
              id="sla-name"
              className="sla-form-input"
              type="text"
              value={form.name}
              onChange={(e) => handleField('name', e.target.value)}
              placeholder="e.g. Enterprise SLA"
              required
            />
          </div>

          <p className="sla-form-hint">
            Enter response and resolution times in minutes. Leave blank for no SLA target.
          </p>

          <table className="sla-times-table">
            <thead>
              <tr>
                <th>Priority</th>
                <th>First Response (min)</th>
                <th>Resolution (min)</th>
              </tr>
            </thead>
            <tbody>
              {PRIORITIES.map((p) => (
                <tr key={p}>
                  <td style={{ textTransform: 'capitalize', fontWeight: 500 }}>{p}</td>
                  <td>
                    <input
                      className="sla-form-input sla-form-input--num"
                      type="number"
                      min="1"
                      value={form[`response_${p}_minutes`]}
                      onChange={(e) => handleField(`response_${p}_minutes`, e.target.value)}
                      placeholder="—"
                    />
                  </td>
                  <td>
                    <input
                      className="sla-form-input sla-form-input--num"
                      type="number"
                      min="1"
                      value={form[`resolution_${p}_minutes`]}
                      onChange={(e) => handleField(`resolution_${p}_minutes`, e.target.value)}
                      placeholder="—"
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          <label className="sla-form-check">
            <input
              type="checkbox"
              checked={form.is_default}
              onChange={(e) => handleField('is_default', e.target.checked)}
            />
            Set as default policy
          </label>

          <div className="sla-form-actions">
            <button type="submit" className="btn btn--sm btn--brand" disabled={saving}>
              {saving ? 'Saving…' : editingId ? 'Save Changes' : 'Create Policy'}
            </button>
            <button type="button" className="btn btn--sm btn--ghost" onClick={cancelForm}>
              Cancel
            </button>
          </div>
        </form>
      )}
    </div>
  );
}

function fmtMin(min) {
  if (min == null) return '—';
  if (min < 60) return `${min}m`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  if (h < 24) return m > 0 ? `${h}h${m}m` : `${h}h`;
  const d = Math.floor(h / 24);
  const rh = h % 24;
  return rh > 0 ? `${d}d${rh}h` : `${d}d`;
}
