import { useState, useEffect } from 'react';
import { useToast } from '../context/ToastContext';

// ResetPasswordModal — lets an admin set a new password for any user.
//
// Props:
//   user     — { id, name } of the target user (name is used for display only)
//   onClose  — called when the modal should close
export default function ResetPasswordModal({ user, onClose }) {
  const { addToast } = useToast();
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  // null while fetching — same pattern as CreateUserForm.
  // We render a fallback of 10 (the hard floor) so the form is usable immediately.
  const [minPasswordLength, setMinPasswordLength] = useState(null);

  // Escape key closes the modal — consistent with all other modals in the app.
  useEffect(() => {
    function handleKeyDown(e) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  // Fetch the live policy on mount so the helper text is accurate.
  // This mirrors CreateUserForm's pattern exactly — the server enforces the same
  // setting, so we surface the same number in the UI.
  useEffect(() => {
    async function loadPolicy() {
      try {
        const res = await fetch('/api/settings');
        const data = await res.json();
        if (res.ok) setMinPasswordLength(data.min_password_length);
      } catch {
        // Silent fallback — server will reject if the password is too short,
        // and the helper text defaults to 10, which is the hard floor.
      }
    }
    loadPolicy();
  }, []);

  async function handleSubmit(e) {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await fetch(`/api/auth/users/${user.id}/reset-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to reset password');

      addToast(`Password updated for ${user.name}`, 'success');
      onClose();
    } catch (err) {
      addToast(err.message, 'error');
    } finally {
      setLoading(false);
    }
  }

  const minLen = minPasswordLength ?? 10;

  return (
    <div
      className="modal-backdrop"
      role="dialog"
      aria-modal="true"
      aria-label="Reset password"
    >
      <div className="modal-card">
        <div className="modal-header">
          <h2 className="modal-title">Reset Password</h2>
          <button className="modal-close" onClick={onClose} aria-label="Close">
            &#x2715;
          </button>
        </div>

        <form onSubmit={handleSubmit} className="modal-body">
          {/* Contextual label — names exactly whose password is changing */}
          <p className="reset-pw-target">
            Setting new password for <strong>{user.name}</strong>
          </p>

          <div className="form-field">
            <label htmlFor="rp-password">New Password</label>
            <input
              id="rp-password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={minLen}
              autoFocus
            />
            <p className="form-field-hint">Minimum {minLen} characters</p>
          </div>

          <div className="modal-footer">
            <button type="button" className="btn-secondary" onClick={onClose}>
              Cancel
            </button>
            <button type="submit" className="btn-primary" disabled={loading}>
              {loading ? 'Saving\u2026' : 'Update Password'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
