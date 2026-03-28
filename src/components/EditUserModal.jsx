import { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';

// EditUserModal — lets an admin update a user's name, email, and role.
//
// Props:
//   user       — the user object being edited { id, name, email, role }
//   onClose    — called when the modal should close
//   onUpdated  — called with the updated user object after a successful PATCH
export default function EditUserModal({ user, onClose, onUpdated }) {
  const { user: currentUser } = useAuth();
  const { addToast } = useToast();

  // Pre-fill the form with the existing user data so the admin can see
  // what they're changing — standard pattern for edit forms.
  const [form, setForm] = useState({
    name: user.name,
    email: user.email,
    role: user.role,
  });
  const [loading, setLoading] = useState(false);

  // The admin is editing their own account — disable role field to prevent
  // self-lockout. Note: the server also enforces this, but disabling the field
  // here makes the constraint visible and avoids a confusing 400 response.
  const isSelf = currentUser?.id === user.id;

  function set(field, value) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await fetch(`/api/auth/users/${user.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        // Only send fields that changed — the server accepts partial updates.
        // Sending all three is fine too; the server ignores no-op changes.
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to update user');

      addToast(`${data.name} updated`, 'success');
      // Pass the canonical server response up — the parent replaces its local
      // copy with this, ensuring the table shows exactly what the DB has.
      onUpdated(data);
      onClose();
    } catch (err) {
      addToast(err.message, 'error');
    } finally {
      setLoading(false);
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
      aria-label="Edit user"
    >
      <div className="modal-card">
        <div className="modal-header">
          <h2 className="modal-title">Edit User</h2>
          <button className="modal-close" onClick={onClose} aria-label="Close">
            &#x2715;
          </button>
        </div>

        <form onSubmit={handleSubmit} className="modal-body">
          <div className="form-field">
            <label htmlFor="eu-name">Name</label>
            <input
              id="eu-name"
              type="text"
              value={form.name}
              onChange={(e) => set('name', e.target.value)}
              required
              autoFocus
            />
          </div>

          <div className="form-field">
            <label htmlFor="eu-email">Email</label>
            <input
              id="eu-email"
              type="email"
              value={form.email}
              onChange={(e) => set('email', e.target.value)}
              required
            />
          </div>

          <div className="form-field">
            <label htmlFor="eu-role">Role</label>
            <select
              id="eu-role"
              value={form.role}
              onChange={(e) => set('role', e.target.value)}
              // Disabled when editing yourself — the server rejects this too,
              // but a disabled field is clearer UX than a mystery error.
              disabled={isSelf}
              aria-describedby={isSelf ? 'eu-role-note' : undefined}
            >
              <option value="agent">Agent</option>
              <option value="admin">Admin</option>
            </select>
            {isSelf && (
              <p id="eu-role-note" className="form-field-hint">
                You cannot change your own role.
              </p>
            )}
          </div>

          <div className="modal-footer">
            <button type="button" className="btn-secondary" onClick={onClose}>
              Cancel
            </button>
            <button type="submit" className="btn-primary" disabled={loading}>
              {loading ? 'Saving\u2026' : 'Save Changes'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
