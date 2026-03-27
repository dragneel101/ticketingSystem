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
  const [selectLatest, setSelectLatest] = useState(false);

  // Resolve "select the newest ticket" intent once the list updates
  const resolvedSelectedId = (() => {
    if (selectLatest && tickets.length > 0) {
      return tickets[tickets.length - 1].id;
    }
    return selectedId;
  })();

  const handleSelectTicket = useCallback((id) => {
    setSelectLatest(false);
    setSelectedId((prev) => (prev === id ? null : id));
  }, []);

  const handleNewTicket = useCallback(() => {
    setShowNewTicket(true);
  }, []);

  const handleCloseForm = useCallback(() => {
    setShowNewTicket(false);
  }, []);

  // After form submission: auto-select the ticket that was just created
  const handleTicketCreated = useCallback(() => {
    setSelectLatest(true);
    setSelectedId(null);
  }, []);

  return (
    <div className="app-shell">
      <TicketList
        selectedId={resolvedSelectedId}
        onSelect={handleSelectTicket}
        onNewTicket={handleNewTicket}
      />

      <main className="main-content" role="main" aria-label="Ticket detail">
        {resolvedSelectedId ? (
          <TicketDetail ticketId={resolvedSelectedId} />
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
