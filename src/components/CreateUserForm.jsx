import { useState, useEffect } from 'react';
import { useToast } from '../context/ToastContext';

export default function CreateUserForm({ onClose, onCreated }) {
  const { addToast } = useToast();
  const [form, setForm] = useState({ email: '', name: '', password: '', role: 'agent' });
  const [loading, setLoading] = useState(false);
  // Start at null so we know the difference between "not yet fetched" and
  // "fetched and it's 10". We fall back to 10 (the hard floor) if the fetch
  // fails so the form is still usable rather than broken.
  const [minPasswordLength, setMinPasswordLength] = useState(null);

  useEffect(() => {
    async function loadPolicy() {
      try {
        const res = await fetch('/api/settings');
        const data = await res.json();
        if (res.ok) setMinPasswordLength(data.min_password_length);
      } catch {
        // Silent fallback — the server will enforce the real policy on submit.
        // We don't toast here because a settings fetch failure shouldn't block
        // the admin from creating a user.
      }
    }
    loadPolicy();
  }, []);

  function set(field, value) {
    setForm(prev => ({ ...prev, [field]: value }));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await fetch('/api/auth/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      // Read the body once — the response stream can only be consumed once,
      // so calling res.json() twice (once for error, once for success) would
      // throw on the second call.
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to create user');
      addToast(`User ${data.name} created`, 'success');
      onCreated?.(data);
      onClose();
    } catch (err) {
      addToast(err.message || 'Failed to create user', 'error');
    } finally {
      setLoading(false);
    }
  }

  function handleBackdropClick(e) {
    if (e.target === e.currentTarget) onClose();
  }

  return (
    <div className="modal-backdrop" onClick={handleBackdropClick} role="dialog" aria-modal="true" aria-label="Create user">
      <div className="modal-card">
        <div className="modal-header">
          <h2 className="modal-title">Create User</h2>
          <button className="modal-close" onClick={onClose} aria-label="Close">&#x2715;</button>
        </div>
        <form onSubmit={handleSubmit} className="modal-body">
          <div className="form-field">
            <label htmlFor="cu-name">Name</label>
            <input id="cu-name" type="text" value={form.name} onChange={e => set('name', e.target.value)} required autoFocus />
          </div>
          <div className="form-field">
            <label htmlFor="cu-email">Email</label>
            <input id="cu-email" type="email" value={form.email} onChange={e => set('email', e.target.value)} required />
          </div>
          <div className="form-field">
            <label htmlFor="cu-password">Password</label>
            <input
              id="cu-password"
              type="password"
              value={form.password}
              onChange={e => set('password', e.target.value)}
              required
              // minPasswordLength is null while fetching — fall back to the hard
              // floor (10) so the attribute is always a meaningful constraint.
              minLength={minPasswordLength ?? 10}
            />
            {/* Helper text reflects the live policy, not a hardcoded number */}
            <p style={{ margin: '4px 0 0', fontSize: '0.8rem', color: 'var(--gray-500)' }}>
              Minimum {minPasswordLength ?? 10} characters
            </p>
          </div>
          <div className="form-field">
            <label htmlFor="cu-role">Role</label>
            <select id="cu-role" value={form.role} onChange={e => set('role', e.target.value)}>
              <option value="agent">Agent</option>
              <option value="admin">Admin</option>
            </select>
          </div>
          <div className="modal-footer">
            <button type="button" className="btn-secondary" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn-primary" disabled={loading}>
              {loading ? 'Creating\u2026' : 'Create User'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
