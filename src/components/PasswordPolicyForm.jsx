import { useState, useEffect } from 'react';
import { useToast } from '../context/ToastContext';

// The hard floor lives in one place — the server — but we mirror it here so
// the input's own min attribute prevents obviously invalid submissions before
// they even leave the browser.
const FLOOR = 10;

export default function PasswordPolicyForm({ onClose }) {
  const { addToast } = useToast();
  const [minLength, setMinLength] = useState(null); // null = loading
  const [inputVal, setInputVal] = useState('');
  const [saving, setSaving] = useState(false);

  // Fetch the current policy on mount so the input shows the live value,
  // not a hardcoded default that may have already been changed by an admin.
  useEffect(() => {
    async function load() {
      try {
        const res = await fetch('/api/settings');
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Failed to load settings');
        setMinLength(data.min_password_length);
        setInputVal(String(data.min_password_length));
      } catch (err) {
        addToast(err.message, 'error');
        onClose();
      }
    }
    load();
  }, []); // empty deps — run once on mount, similar to componentDidMount

  async function handleSubmit(e) {
    e.preventDefault();
    const parsed = parseInt(inputVal, 10);

    // Client-side guard mirrors the server rule — catches obvious mistakes
    // before a round-trip, but the server will re-validate regardless.
    if (isNaN(parsed) || parsed < FLOOR) {
      addToast(`Minimum length cannot be less than ${FLOOR}`, 'error');
      return;
    }

    setSaving(true);
    try {
      const res = await fetch('/api/settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ min_password_length: parsed }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to save settings');

      setMinLength(data.min_password_length);
      addToast('Password policy updated', 'success');
      onClose();
    } catch (err) {
      addToast(err.message, 'error');
    } finally {
      setSaving(false);
    }
  }

  function handleBackdropClick(e) {
    if (e.target === e.currentTarget) onClose();
  }

  return (
    <div
      className="modal-backdrop"
      onClick={handleBackdropClick}
      role="dialog"
      aria-modal="true"
      aria-label="Password policy settings"
    >
      <div className="modal-card">
        <div className="modal-header">
          <h2 className="modal-title">Password Policy</h2>
          <button className="modal-close" onClick={onClose} aria-label="Close">&#x2715;</button>
        </div>

        {/* Show a placeholder while settings are loading */}
        {minLength === null ? (
          <div className="modal-body">
            <p style={{ color: 'var(--gray-500)', fontSize: '0.875rem' }}>Loading…</p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="modal-body">
            <div className="form-field">
              <label htmlFor="pp-min-length">Minimum password length</label>
              <input
                id="pp-min-length"
                type="number"
                value={inputVal}
                min={FLOOR}
                step={1}
                required
                autoFocus
                onChange={e => setInputVal(e.target.value)}
              />
              {/* Helper text showing the floor so admins understand the constraint */}
              <p style={{ margin: '4px 0 0', fontSize: '0.8rem', color: 'var(--gray-500)' }}>
                Minimum allowed value is {FLOOR}. Currently set to {minLength}.
              </p>
            </div>

            <div className="modal-footer">
              <button type="button" className="btn-secondary" onClick={onClose}>
                Cancel
              </button>
              <button type="submit" className="btn-primary" disabled={saving}>
                {saving ? 'Saving…' : 'Save'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
