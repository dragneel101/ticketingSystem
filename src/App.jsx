import { useState, useCallback } from 'react';
import { AuthProvider, useAuth } from './context/AuthContext';
import { TicketProvider } from './context/TicketContext';
import { ToastProvider, useToast } from './context/ToastContext';
import TicketList from './components/TicketList';
import TicketDetail, { EmptyState } from './components/TicketDetail';
import NewTicketForm from './components/NewTicketForm';
import LoginForm from './components/LoginForm';
import CreateUserForm from './components/CreateUserForm';
import PasswordPolicyForm from './components/PasswordPolicyForm';

/* ── inner shell — must be inside TicketProvider ─────────── */
function AppShell() {
  const { user, logout } = useAuth();
  const { addToast } = useToast();
  const [selectedId, setSelectedId] = useState(null);
  const [showNewTicket, setShowNewTicket] = useState(false);
  const [showCreateUser, setShowCreateUser] = useState(false);
  const [showSettings, setShowSettings] = useState(false);

  async function handleLogout() {
    await logout();
    addToast('Logged out', 'info');
  }

  const handleSelectTicket = useCallback((id) => {
    setSelectedId((prev) => (prev === id ? null : id));
  }, []);

  const handleNewTicket = useCallback(() => setShowNewTicket(true), []);
  const handleCloseForm = useCallback(() => setShowNewTicket(false), []);

  // Receive the created ticket's ID and select it directly
  const handleTicketCreated = useCallback((newId) => {
    setSelectedId(newId);
  }, []);

  return (
    <>
      <header className="app-header">
        <span className="app-header-brand">Support Portal</span>
        {user?.role === 'admin' && (
          <>
            <button className="app-header-admin-btn" onClick={() => setShowSettings(true)}>
              Settings
            </button>
            <button className="app-header-admin-btn" onClick={() => setShowCreateUser(true)}>
              + Add User
            </button>
          </>
        )}
        <div className="app-header-user">
          <span className="app-header-name">{user?.name}</span>
          <button className="app-header-logout" onClick={handleLogout}>Sign out</button>
        </div>
      </header>

      <div className="app-shell">
        <TicketList
          selectedId={selectedId}
          onSelect={handleSelectTicket}
          onNewTicket={handleNewTicket}
          currentUser={user}
          onLogout={handleLogout}
        />

        <main className="main-content" role="main" aria-label="Ticket detail">
          {selectedId ? (
            <TicketDetail key={selectedId} ticketId={selectedId} />
          ) : (
            <EmptyState />
          )}
        </main>

        {showNewTicket && (
          <NewTicketForm
            onClose={handleCloseForm}
            onCreated={handleTicketCreated}
          />
        )}
      </div>
      {showCreateUser && (
        <CreateUserForm onClose={() => setShowCreateUser(false)} />
      )}
      {showSettings && (
        <PasswordPolicyForm onClose={() => setShowSettings(false)} />
      )}
    </>
  );
}

/* ── authenticated app — providers only mount when logged in ─ */
// We avoid mounting TicketProvider until after login so it doesn't
// attempt to fetch /api/tickets (which would get a 401) while the
// user is unauthenticated.
function AuthenticatedApp() {
  const { user, authLoading } = useAuth();

  // Show nothing while we check the session — avoids a flash of login
  // form for users who already have a valid session cookie.
  if (authLoading) {
    return <div className="auth-loading" aria-label="Loading" />;
  }

  if (!user) {
    return <LoginForm />;
  }

  return (
    <ToastProvider>
      <TicketProvider>
        <AppShell />
      </TicketProvider>
    </ToastProvider>
  );
}

/* ── root ────────────────────────────────────────────────── */
export default function App() {
  return (
    <AuthProvider>
      <AuthenticatedApp />
    </AuthProvider>
  );
}
