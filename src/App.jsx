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
import LandingPage from './components/LandingPage';
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

// Persist navigation state in sessionStorage so a page refresh restores the
// same view. Clears automatically when the tab is closed.
const VALID_VIEWS = new Set(Object.values(VIEWS));

function readSession() {
  try {
    const view = sessionStorage.getItem('nav_view');
    const id   = sessionStorage.getItem('nav_selectedId');
    const co   = sessionStorage.getItem('nav_selectedCompany');
    return {
      view:    VALID_VIEWS.has(view) ? view : VIEWS.DASHBOARD,
      id:      id || null,
      company: co ? JSON.parse(co) : null,
    };
  } catch {
    return { view: VIEWS.DASHBOARD, id: null, company: null };
  }
}

/* ── inner shell — must be inside TicketProvider ─────────── */
function AppShell() {
  const { user, logout } = useAuth();
  const { addToast } = useToast();

  const session = readSession();
  // ticket_detail requires a selectedId; company_detail requires a company object.
  // Fall back gracefully when the required data is missing.
  const initialView =
    (session.view === VIEWS.TICKET_DETAIL && !session.id) ||
    (session.view === VIEWS.COMPANY_DETAIL && !session.company)
      ? VIEWS.DASHBOARD
      : session.view;

  const [activeView, setActiveView] = useState(initialView);
  const [selectedId, setSelectedId] = useState(session.id);
  const [showNewTicket, setShowNewTicket] = useState(false);
  const [customerSearch, setCustomerSearch] = useState('');
  const [selectedCompany, setSelectedCompany] = useState(session.company);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const userMenuRef = useRef(null);

  // Keep sessionStorage in sync whenever navigation state changes.
  useEffect(() => {
    sessionStorage.setItem('nav_view', activeView);
  }, [activeView]);

  useEffect(() => {
    if (selectedId) sessionStorage.setItem('nav_selectedId', selectedId);
    else            sessionStorage.removeItem('nav_selectedId');
  }, [selectedId]);

  useEffect(() => {
    if (selectedCompany) sessionStorage.setItem('nav_selectedCompany', JSON.stringify(selectedCompany));
    else                 sessionStorage.removeItem('nav_selectedCompany');
  }, [selectedCompany]);

  useEffect(() => {
    if (!userMenuOpen) return;
    function handleClickOutside(e) {
      if (userMenuRef.current && !userMenuRef.current.contains(e.target)) {
        setUserMenuOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [userMenuOpen]);

  async function handleLogout() {
    sessionStorage.removeItem('nav_view');
    sessionStorage.removeItem('nav_selectedId');
    sessionStorage.removeItem('nav_selectedCompany');
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

          <div className="app-header-user" ref={userMenuRef}>
            <button
              className={`app-header-user-trigger${userMenuOpen ? ' app-header-user-trigger--open' : ''}`}
              onClick={() => setUserMenuOpen(v => !v)}
              aria-haspopup="true"
              aria-expanded={userMenuOpen}
              aria-label="User menu"
            >
              <span className="app-header-avatar" aria-hidden="true">
                {user?.name?.charAt(0).toUpperCase()}
              </span>
              <span className="app-header-name">{user?.name}</span>
              <svg className="app-header-chevron" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                <path d="M4 6l4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </button>
            {userMenuOpen && (
              <div className="app-header-user-menu" role="menu">
                <button className="app-header-logout" onClick={handleLogout} role="menuitem">
                  Sign out
                </button>
              </div>
            )}
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
  const [showLanding, setShowLanding] = useState(true);

  // When the user logs out (user goes from truthy → null), reset to landing page.
  useEffect(() => {
    if (!user && !authLoading) setShowLanding(true);
  }, [user, authLoading]);

  // Show nothing while we check the session — avoids a flash of login
  // form for users who already have a valid session cookie.
  if (authLoading) {
    return <div className="auth-loading" aria-label="Loading" />;
  }

  if (!user) {
    if (showLanding) {
      return <LandingPage onSignIn={() => setShowLanding(false)} />;
    }
    return <LoginForm onBack={() => setShowLanding(true)} />;
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
