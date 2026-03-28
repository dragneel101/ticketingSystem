import { useState, useCallback } from 'react';
import { AuthProvider, useAuth } from './context/AuthContext';
import { TicketProvider } from './context/TicketContext';
import { ToastProvider, useToast } from './context/ToastContext';
import TicketList from './components/TicketList';
import TicketDetail, { EmptyState } from './components/TicketDetail';
import NewTicketForm from './components/NewTicketForm';
import LoginForm from './components/LoginForm';
import UserManagementPage from './components/UserManagementPage';
import AdminConfigPage from './components/AdminConfigPage';
import DashboardPage from './components/DashboardPage';

// Top-level views. DASHBOARD is the default landing page after login.
// String values keep activeView comparisons readable as the view list grows.
const VIEWS = {
  DASHBOARD: 'dashboard',
  TICKETS: 'tickets',
  USERS: 'users',
  SETTINGS: 'settings',
};

/* ── inner shell — must be inside TicketProvider ─────────── */
function AppShell() {
  const { user, logout } = useAuth();
  const { addToast } = useToast();
  const [activeView, setActiveView] = useState(VIEWS.DASHBOARD);
  const [selectedId, setSelectedId] = useState(null);
  const [showNewTicket, setShowNewTicket] = useState(false);

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

  // Switching views preserves selectedId intentionally — navigating away
  // from the tickets view and back should restore the last-selected ticket.
  function handleNavClick(view) {
    setActiveView(view);
  }

  // Called by DashboardPage's "View" button on a recent ticket row.
  // Does two state updates atomically from the parent's perspective — React
  // batches these in a single re-render, so there's no intermediate flash.
  const handleViewTicket = useCallback((ticketId) => {
    setSelectedId(ticketId);
    setActiveView(VIEWS.TICKETS);
  }, []);

  // Called by DashboardPage's Quick Actions buttons.
  // Accepts a VIEWS value string so DashboardPage doesn't need to import VIEWS.
  const handleNavigate = useCallback((view) => {
    setActiveView(view);
  }, []);

  const isAdmin = user?.role === 'admin';

  return (
    <>
      <header className="app-header">
        <span className="app-header-brand">Support Portal</span>

        {/* Main nav — Dashboard and Tickets are visible to all roles.
            Users and Settings are admin-only, guarded here and at render time. */}
        <nav className="app-header-nav" aria-label="Main navigation">
          <button
            className={`app-header-nav-item${activeView === VIEWS.DASHBOARD ? ' app-header-nav-item--active' : ''}`}
            onClick={() => handleNavClick(VIEWS.DASHBOARD)}
          >
            Dashboard
          </button>
          <button
            className={`app-header-nav-item${activeView === VIEWS.TICKETS ? ' app-header-nav-item--active' : ''}`}
            onClick={() => handleNavClick(VIEWS.TICKETS)}
          >
            Tickets
          </button>
          {isAdmin && (
            <button
              className={`app-header-nav-item${activeView === VIEWS.USERS ? ' app-header-nav-item--active' : ''}`}
              onClick={() => handleNavClick(VIEWS.USERS)}
            >
              Users
            </button>
          )}
          {isAdmin && (
            <button
              className={`app-header-nav-item${activeView === VIEWS.SETTINGS ? ' app-header-nav-item--active' : ''}`}
              onClick={() => handleNavClick(VIEWS.SETTINGS)}
            >
              Settings
            </button>
          )}
        </nav>

        <div className="app-header-user">
          <span className="app-header-name">{user?.name}</span>
          <button className="app-header-logout" onClick={handleLogout}>Sign out</button>
        </div>
      </header>

      {/* View switcher — no router needed at this scale */}
      {activeView === VIEWS.DASHBOARD && (
        <DashboardPage
          onViewTicket={handleViewTicket}
          onNavigate={handleNavigate}
        />
      )}

      {activeView === VIEWS.TICKETS && (
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
      )}

      {/* Guard: isAdmin check here prevents direct state mutation from reaching
          these pages even if the nav buttons are hidden for non-admins */}
      {activeView === VIEWS.USERS && isAdmin && <UserManagementPage />}
      {activeView === VIEWS.SETTINGS && isAdmin && <AdminConfigPage />}
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
