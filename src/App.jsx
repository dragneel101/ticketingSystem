import { useState, useCallback, useEffect, useRef } from 'react';
import { AuthProvider, useAuth } from './context/AuthContext';
import { TicketProvider } from './context/TicketContext';
import { ToastProvider, useToast } from './context/ToastContext';
import { SlaProvider } from './context/SlaContext';
import { BoardProvider } from './context/BoardContext';
import TicketList from './components/TicketList';
import TicketPage from './components/TicketPage';
import NewTicketForm from './components/NewTicketForm';
import LoginForm from './components/LoginForm';
import UserManagementPage from './components/UserManagementPage';
import AdminConfigPage from './components/AdminConfigPage';
import DashboardPage from './components/DashboardPage';
import CustomersPage from './components/CustomersPage';
import CompaniesPage, { CompanyDetailPage } from './components/CompaniesPage';

// Top-level views. DASHBOARD is the default landing page after login.
// TICKET_DETAIL is a full-page takeover that hides the sidebar and uses
// all available width for the two-column ticket layout.
// String values keep activeView comparisons readable as the view list grows.
const VIEWS = {
  DASHBOARD: 'dashboard',
  TICKETS: 'tickets',
  TICKET_DETAIL: 'ticket_detail',
  CUSTOMERS: 'customers',
  COMPANIES: 'companies',
  COMPANY_DETAIL: 'company_detail',
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
  const [customerSearch, setCustomerSearch] = useState('');
  const [selectedCompany, setSelectedCompany] = useState(null);

  async function handleLogout() {
    await logout();
    addToast('Logged out', 'info');
  }

  // Clicking a ticket navigates to the full-page detail view.
  // Clicking the same ticket a second time while already in detail view is
  // handled by the back button — this callback is only called from the list.
  const handleSelectTicket = useCallback((id) => {
    setSelectedId(id);
    setActiveView(VIEWS.TICKET_DETAIL);
  }, []);

  const handleNewTicket = useCallback(() => setShowNewTicket(true), []);
  const handleCloseForm = useCallback(() => setShowNewTicket(false), []);

  // After a new ticket is created, jump straight to its detail page.
  const handleTicketCreated = useCallback((newId) => {
    setSelectedId(newId);
    setActiveView(VIEWS.TICKET_DETAIL);
  }, []);

  // Switching views preserves selectedId intentionally — navigating away
  // from the tickets view and back should restore the last-selected ticket.
  function handleNavClick(view) {
    setActiveView(view);
  }

  // Called by DashboardPage's "View" button on a recent ticket row.
  // Goes directly to the full-page detail view for that ticket.
  const handleViewTicket = useCallback((ticketId) => {
    setSelectedId(ticketId);
    setActiveView(VIEWS.TICKET_DETAIL);
  }, []);

  // Called by DashboardPage's Quick Actions buttons.
  // Accepts a VIEWS value string so DashboardPage doesn't need to import VIEWS.
  const handleNavigate = useCallback((view) => {
    setActiveView(view);
  }, []);

  // Called by TicketPage's customer card — navigates to Customers page with
  // the customer's email pre-filled in the search box.
  const handleViewCustomer = useCallback((email) => {
    setCustomerSearch(email);
    setActiveView(VIEWS.CUSTOMERS);
  }, []);

  const handleSelectCompany = useCallback((company) => {
    setSelectedCompany(company);
    setActiveView(VIEWS.COMPANY_DETAIL);
  }, []);

  const isAdmin = user?.role === 'admin';
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const mobileNavRef = useRef(null);

  // Close the mobile nav when clicking outside of it.
  useEffect(() => {
    if (!mobileNavOpen) return;
    function handleClick(e) {
      if (mobileNavRef.current && !mobileNavRef.current.contains(e.target)) {
        setMobileNavOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [mobileNavOpen]);

  // Close mobile nav on Escape.
  useEffect(() => {
    if (!mobileNavOpen) return;
    function handleKey(e) {
      if (e.key === 'Escape') setMobileNavOpen(false);
    }
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [mobileNavOpen]);

  function handleMobileNavClick(view) {
    handleNavClick(view);
    setMobileNavOpen(false);
  }

  return (
    <>
      <header className="app-header">
        <div className="app-header-inner">
          <span className="app-header-brand">Support Portal</span>

          {/* Desktop nav — Dashboard and Tickets are visible to all roles.
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
            <button
              className={`app-header-nav-item${activeView === VIEWS.CUSTOMERS ? ' app-header-nav-item--active' : ''}`}
              onClick={() => handleNavClick(VIEWS.CUSTOMERS)}
            >
              Customers
            </button>
            <button
              className={`app-header-nav-item${(activeView === VIEWS.COMPANIES || activeView === VIEWS.COMPANY_DETAIL) ? ' app-header-nav-item--active' : ''}`}
              onClick={() => handleNavClick(VIEWS.COMPANIES)}
            >
              Companies
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

          {/* Mobile hamburger — only visible below the responsive breakpoint */}
          <button
            className={`app-header-hamburger${mobileNavOpen ? ' app-header-hamburger--open' : ''}`}
            onClick={() => setMobileNavOpen((v) => !v)}
            aria-label={mobileNavOpen ? 'Close menu' : 'Open menu'}
            aria-expanded={mobileNavOpen}
          >
            <span className="app-header-hamburger-bar" />
            <span className="app-header-hamburger-bar" />
            <span className="app-header-hamburger-bar" />
          </button>
        </div>

        {/* Mobile nav drawer — slides down from header */}
        {mobileNavOpen && (
          <div className="app-mobile-nav" ref={mobileNavRef} role="navigation" aria-label="Mobile navigation">
            <button
              className={`app-mobile-nav-item${activeView === VIEWS.DASHBOARD ? ' app-mobile-nav-item--active' : ''}`}
              onClick={() => handleMobileNavClick(VIEWS.DASHBOARD)}
            >Dashboard</button>
            <button
              className={`app-mobile-nav-item${activeView === VIEWS.TICKETS ? ' app-mobile-nav-item--active' : ''}`}
              onClick={() => handleMobileNavClick(VIEWS.TICKETS)}
            >Tickets</button>
            <button
              className={`app-mobile-nav-item${activeView === VIEWS.CUSTOMERS ? ' app-mobile-nav-item--active' : ''}`}
              onClick={() => handleMobileNavClick(VIEWS.CUSTOMERS)}
            >Customers</button>
            <button
              className={`app-mobile-nav-item${(activeView === VIEWS.COMPANIES || activeView === VIEWS.COMPANY_DETAIL) ? ' app-mobile-nav-item--active' : ''}`}
              onClick={() => handleMobileNavClick(VIEWS.COMPANIES)}
            >Companies</button>
            {isAdmin && (
              <button
                className={`app-mobile-nav-item${activeView === VIEWS.USERS ? ' app-mobile-nav-item--active' : ''}`}
                onClick={() => handleMobileNavClick(VIEWS.USERS)}
              >Users</button>
            )}
            {isAdmin && (
              <button
                className={`app-mobile-nav-item${activeView === VIEWS.SETTINGS ? ' app-mobile-nav-item--active' : ''}`}
                onClick={() => handleMobileNavClick(VIEWS.SETTINGS)}
              >Settings</button>
            )}
            <div className="app-mobile-nav-footer">
              <span className="app-mobile-nav-user">{user?.name}</span>
              <button className="app-header-logout" onClick={handleLogout}>Sign out</button>
            </div>
          </div>
        )}
      </header>

      {/* View switcher — no router needed at this scale */}
      {activeView === VIEWS.DASHBOARD && (
        <DashboardPage
          onViewTicket={handleViewTicket}
          onNavigate={handleNavigate}
        />
      )}

      {/* Ticket list view — full-page centered layout */}
      {activeView === VIEWS.TICKETS && (
        <main className="tl-main" role="main" aria-label="Tickets">
          <TicketList
            selectedId={selectedId}
            onSelect={handleSelectTicket}
            onNewTicket={handleNewTicket}
          />

          {showNewTicket && (
            <NewTicketForm
              onClose={handleCloseForm}
              onCreated={handleTicketCreated}
            />
          )}
        </main>
      )}

      {/* Full-page ticket detail — no sidebar, full width for the two-column layout.
          key={selectedId} remounts TicketPage when a different ticket is selected,
          which resets local state (active tab, scroll position, draft text) cleanly.
          overflow: hidden here is intentional — TicketPage manages its own scroll
          regions internally (sidebar scrolls, tab content scrolls). */}
      {activeView === VIEWS.TICKET_DETAIL && selectedId && (
        <div className="main-content">
          <TicketPage
            key={selectedId}
            ticketId={selectedId}
            onBack={() => setActiveView(VIEWS.TICKETS)}
            onViewCustomer={handleViewCustomer}
          />
          {showNewTicket && (
            <NewTicketForm
              onClose={handleCloseForm}
              onCreated={handleTicketCreated}
            />
          )}
        </div>
      )}

      {activeView === VIEWS.CUSTOMERS && (
        <CustomersPage
          onSelectTicket={handleSelectTicket}
          initialSearch={customerSearch}
        />
      )}

      {activeView === VIEWS.COMPANIES && (
        <CompaniesPage
          onSelectCompany={handleSelectCompany}
          onSelectTicket={handleSelectTicket}
        />
      )}

      {activeView === VIEWS.COMPANY_DETAIL && selectedCompany && (
        <CompanyDetailPage
          key={selectedCompany.id}
          company={selectedCompany}
          onBack={() => setActiveView(VIEWS.COMPANIES)}
          onSelectTicket={handleSelectTicket}
          onViewCustomer={handleViewCustomer}
        />
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
      <SlaProvider>
        <BoardProvider>
        <TicketProvider>
          <AppShell />
        </TicketProvider>
        </BoardProvider>
      </SlaProvider>
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
