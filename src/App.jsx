import { useState, useCallback } from 'react';
import { TicketProvider, useTickets } from './context/TicketContext';
import { ToastProvider } from './context/ToastContext';
import TicketList from './components/TicketList';
import TicketDetail, { EmptyState } from './components/TicketDetail';
import NewTicketForm from './components/NewTicketForm';

/* ── inner shell — must be inside TicketProvider ─────────── */
function AppShell() {
  const { tickets } = useTickets();
  const [selectedId, setSelectedId] = useState(null);
  const [showNewTicket, setShowNewTicket] = useState(false);

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
    <div className="app-shell">
      <TicketList
        selectedId={selectedId}
        onSelect={handleSelectTicket}
        onNewTicket={handleNewTicket}
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
  );
}

/* ── root ────────────────────────────────────────────────── */
export default function App() {
  return (
    <ToastProvider>
      <TicketProvider>
        <AppShell />
      </TicketProvider>
    </ToastProvider>
  );
}
