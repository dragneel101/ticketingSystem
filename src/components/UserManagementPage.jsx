import { useState, useEffect, useCallback, useMemo } from 'react';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import CreateUserForm from './CreateUserForm';
import EditUserModal from './EditUserModal';
import ResetPasswordModal from './ResetPasswordModal';

// Role badge — small colored chip matching the app's existing pill aesthetic.
function RoleBadge({ role }) {
  const cls = role === 'admin' ? 'role-badge role-badge--admin' : 'role-badge role-badge--agent';
  return <span className={cls}>{role}</span>;
}

function getInitials(name) {
  return name.split(' ').filter(Boolean).map(n => n[0]).join('').toUpperCase().slice(0, 2);
}

// Format an ISO timestamp to a readable local date string.
// Intl.DateTimeFormat is the idiomatic JS approach — it respects the browser's
// locale automatically, so admins in different regions get sensible formatting.
function formatDate(iso) {
  return new Intl.DateTimeFormat(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  }).format(new Date(iso));
}

// UserRow handles per-row state: the inline delete confirmation and which
// modal (if any) is open for this specific row.
// Keeping this state in the row component rather than the parent avoids
// storing a map of "which row is confirming delete" in the parent — each row
// is self-contained and cleans up when it unmounts.
function UserRow({ user, isSelf, onUpdated, onDeleted }) {
  const { addToast } = useToast();

  // 'idle' | 'confirming' — drives the inline delete confirmation UI.
  const [deleteState, setDeleteState] = useState('idle');
  const [deleteLoading, setDeleteLoading] = useState(false);

  // Which modal is open for this row: null | 'edit' | 'resetPassword'
  const [modal, setModal] = useState(null);

  async function handleDelete() {
    setDeleteLoading(true);
    try {
      const res = await fetch(`/api/auth/users/${user.id}`, { method: 'DELETE' });

      // DELETE returns 204 No Content on success — no body to parse.
      if (!res.ok) {
        // Non-204 responses will have a JSON error body.
        const data = await res.json();
        throw new Error(data.error || 'Failed to delete user');
      }

      addToast(`${user.name} deleted`, 'success');
      // Optimistic removal: tell the parent to splice this user out of its
      // array by id. No re-fetch needed — we know the row is gone.
      onDeleted(user.id);
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
        <td className="user-table-name">
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span className="item-avatar" aria-hidden="true">{getInitials(user.name)}</span>
            <span>{user.name}</span>
          </div>
        </td>
        <td className="user-table-email">{user.email}</td>
        <td><RoleBadge role={user.role} /></td>
        <td className="user-table-date">{formatDate(user.created_at)}</td>
        <td className="user-table-actions">
          {deleteState === 'confirming' ? (
            // Inline confirmation — replaces the action buttons in this row only.
            // The user's eyes are still on the row they're about to delete,
            // which is better context than a modal that obscures the table.
            <div className="user-delete-confirm">
              <span className="user-delete-confirm-text">Delete {user.name}?</span>
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
            // Normal state: three action buttons.
            <div className="user-row-actions">
              <button
                className="btn-row-action"
                onClick={() => setModal('edit')}
                aria-label={`Edit ${user.name}`}
              >
                Edit
              </button>
              <button
                className="btn-row-action"
                onClick={() => setModal('resetPassword')}
                aria-label={`Reset password for ${user.name}`}
              >
                Reset Password
              </button>
              {/* Disabled for own account — the server rejects self-delete,
                  but disabling is more informative than showing an error */}
              <button
                className="btn-row-action btn-row-action--danger"
                onClick={() => setDeleteState('confirming')}
                disabled={isSelf}
                aria-label={`Delete ${user.name}`}
              >
                Delete
              </button>
            </div>
          )}
        </td>
      </tr>

      {modal === 'edit' && (
        <EditUserModal
          user={user}
          onClose={() => setModal(null)}
          onUpdated={(updated) => {
            onUpdated(updated);
            setModal(null);
          }}
        />
      )}

      {modal === 'resetPassword' && (
        <ResetPasswordModal
          user={user}
          onClose={() => setModal(null)}
        />
      )}
    </>
  );
}

export default function UserManagementPage() {
  const { user: currentUser } = useAuth();
  const { addToast } = useToast();
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showCreateUser, setShowCreateUser] = useState(false);
  const [searchInput, setSearchInput] = useState('');
  const [roleFilter, setRoleFilter] = useState('all');

  const filteredUsers = useMemo(() => {
    let result = users;
    if (searchInput.trim()) {
      const q = searchInput.toLowerCase();
      result = result.filter(u =>
        u.name.toLowerCase().includes(q) || u.email.toLowerCase().includes(q)
      );
    }
    if (roleFilter !== 'all') {
      result = result.filter(u => u.role === roleFilter);
    }
    return result;
  }, [users, searchInput, roleFilter]);

  const adminCount = useMemo(() => users.filter(u => u.role === 'admin').length, [users]);
  const agentCount = useMemo(() => users.filter(u => u.role === 'agent').length, [users]);

  // Fetch the full user list on mount. We do this inside the component
  // (not in a context) because user management is a narrow admin concern —
  // there's no benefit to broadcasting this data to the rest of the tree.
  async function fetchUsers() {
    setLoading(true);
    try {
      const res = await fetch('/api/auth/users');
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to load users');
      setUsers(data);
    } catch (err) {
      addToast(err.message, 'error');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchUsers();
  }, []); // run once on mount

  // Called by CreateUserForm after a successful POST. We prepend the new user
  // to the local list rather than re-fetching — avoids a round-trip and keeps
  // the UI snappy.
  const handleUserCreated = useCallback((newUser) => {
    setUsers((prev) => [newUser, ...prev]);
  }, []);

  // Optimistic update after edit: replace the edited user in place by id.
  // Array.map creates a new array (immutable update), which React needs to
  // detect the change and re-render. We don't re-fetch because the server
  // already returned the canonical updated row in the PATCH response body.
  const handleUserUpdated = useCallback((updatedUser) => {
    setUsers((prev) =>
      prev.map((u) => (u.id === updatedUser.id ? updatedUser : u))
    );
  }, []);

  // Optimistic removal after delete: filter out the deleted user by id.
  // Again, no re-fetch — we know the row is gone because the server returned 204.
  const handleUserDeleted = useCallback((deletedId) => {
    setUsers((prev) => prev.filter((u) => u.id !== deletedId));
  }, []);

  return (
    <div className="admin-page">
      <div className="admin-page-header">
        <div className="admin-page-header-inner">
          <div className="admin-page-header-row">
            <div>
              <h1 className="admin-page-title">User Management</h1>
              <p className="admin-page-subtitle">Create and manage agent and admin accounts.</p>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
              {!loading && (
                <div className="page-stat-chips">
                  <span className="page-stat-chip">
                    <span className="page-stat-chip-num">{users.length}</span> Total
                  </span>
                  <span className="page-stat-chip page-stat-chip--brand">
                    <span className="page-stat-chip-num">{adminCount}</span> Admin{adminCount !== 1 ? 's' : ''}
                  </span>
                  <span className="page-stat-chip">
                    <span className="page-stat-chip-num">{agentCount}</span> Agent{agentCount !== 1 ? 's' : ''}
                  </span>
                </div>
              )}
              <button className="btn btn-primary" onClick={() => setShowCreateUser(true)}>
                + Add User
              </button>
            </div>
          </div>

          <div className="cust-search-row" style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
            <div className="cust-search-wrap" style={{ maxWidth: 320, flex: '1 1 auto' }}>
              <svg className="cust-search-icon" width="15" height="15" viewBox="0 0 12 12" fill="none" aria-hidden="true">
                <circle cx="5" cy="5" r="3.5" stroke="currentColor" strokeWidth="1.4" />
                <path d="M8 8l2.5 2.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
              </svg>
              <input
                className="cust-search cust-search--icon"
                type="search"
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                placeholder="Search by name or email…"
                aria-label="Search users"
              />
            </div>
            <select
              className="usr-filter-select"
              value={roleFilter}
              onChange={(e) => setRoleFilter(e.target.value)}
              aria-label="Filter by role"
            >
              <option value="all">All roles</option>
              <option value="admin">Admins only</option>
              <option value="agent">Agents only</option>
            </select>
          </div>
        </div>
      </div>

      <div className="admin-page-body">
        {loading ? (
          <div className="admin-page-loading">Loading users&hellip;</div>
        ) : (
          <div className="user-table-wrap">
            <table className="user-table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Email</th>
                  <th>Role</th>
                  <th>Created</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {users.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="user-table-empty">No users found.</td>
                  </tr>
                ) : filteredUsers.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="user-table-empty">No users match your search.</td>
                  </tr>
                ) : (
                  filteredUsers.map((u) => (
                    <UserRow
                      key={u.id}
                      user={u}
                      isSelf={currentUser?.id === u.id}
                      onUpdated={handleUserUpdated}
                      onDeleted={handleUserDeleted}
                    />
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {showCreateUser && (
        <CreateUserForm
          onClose={() => setShowCreateUser(false)}
          onCreated={handleUserCreated}
        />
      )}
    </div>
  );
}
