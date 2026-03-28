import { useState, useEffect, useCallback } from 'react';
import { useToast } from '../context/ToastContext';
import CreateUserForm from './CreateUserForm';

// Role badge — small colored chip matching the app's existing pill aesthetic.
function RoleBadge({ role }) {
  // Admin gets the brand color; agents get a neutral treatment.
  const cls = role === 'admin' ? 'role-badge role-badge--admin' : 'role-badge role-badge--agent';
  return <span className={cls}>{role}</span>;
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

export default function UserManagementPage() {
  const { addToast } = useToast();
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showCreateUser, setShowCreateUser] = useState(false);

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
  // the UI snappy. The server already returns the created row, so we trust it.
  const handleUserCreated = useCallback((newUser) => {
    setUsers((prev) => [newUser, ...prev]);
  }, []);

  return (
    <div className="admin-page">
      <div className="admin-page-header">
        <div className="admin-page-header-row">
          <div>
            <h1 className="admin-page-title">User Management</h1>
            <p className="admin-page-subtitle">Create and review agent and admin accounts.</p>
          </div>
          <button className="btn-primary" onClick={() => setShowCreateUser(true)}>
            + Add User
          </button>
        </div>
      </div>

      <div className="admin-page-body">
        {loading ? (
          <div className="admin-page-loading">Loading users…</div>
        ) : (
          <div className="user-table-wrap">
            <table className="user-table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Email</th>
                  <th>Role</th>
                  <th>Created</th>
                </tr>
              </thead>
              <tbody>
                {users.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="user-table-empty">No users found.</td>
                  </tr>
                ) : (
                  users.map((u) => (
                    <tr key={u.id}>
                      <td className="user-table-name">{u.name}</td>
                      <td className="user-table-email">{u.email}</td>
                      <td><RoleBadge role={u.role} /></td>
                      <td className="user-table-date">{formatDate(u.created_at)}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* CreateUserForm stays a modal — it was already working well as one */}
      {showCreateUser && (
        <CreateUserForm
          onClose={() => setShowCreateUser(false)}
          onCreated={handleUserCreated}
        />
      )}
    </div>
  );
}
