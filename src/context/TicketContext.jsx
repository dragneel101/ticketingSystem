import { createContext, useContext, useState, useEffect } from 'react';

const TicketContext = createContext(null);

export function TicketProvider({ children }) {
  const [tickets, setTickets] = useState([]);
  const [loading, setLoading] = useState(true);

  // Load all tickets on mount
  useEffect(() => {
    fetch('/api/tickets')
      .then((r) => r.json())
      .then(setTickets)
      .catch((err) => console.error('Failed to load tickets', err))
      .finally(() => setLoading(false));
  }, []);

  // Fetch a single ticket (with messages) and merge into state
  async function loadTicket(id) {
    const res = await fetch(`/api/tickets/${id}`);
    if (!res.ok) throw new Error('Failed to load ticket');
    const ticket = await res.json();
    setTickets((prev) => prev.map((t) => (t.id === id ? ticket : t)));
    return ticket;
  }

  async function addTicket(ticket) {
    const res = await fetch('/api/tickets', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(ticket),
    });
    if (!res.ok) throw new Error('Failed to create ticket');
    const created = await res.json();
    setTickets((prev) => [created, ...prev]);
    return created;
  }

  async function updateTicket(id, changes) {
    const res = await fetch(`/api/tickets/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(changes),
    });
    if (!res.ok) throw new Error('Failed to update ticket');
    const updated = await res.json();
    setTickets((prev) => prev.map((t) => (t.id === id ? { ...t, ...updated } : t)));
  }

  async function deleteTicket(id) {
    const res = await fetch(`/api/tickets/${id}`, { method: 'DELETE' });
    if (!res.ok) throw new Error((await res.json()).error);
    setTickets(prev => prev.filter(t => t.id !== id));
  }

  async function addMessage(ticketId, message) {
    const res = await fetch(`/api/tickets/${ticketId}/messages`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      // Forward the optional `type` field so callers can post 'note' messages.
      // If message.type is undefined the server defaults to 'message'.
      body: JSON.stringify({ from: message.from, text: message.text, type: message.type }),
    });
    if (!res.ok) throw new Error('Failed to send message');
    const msg = await res.json();
    setTickets((prev) =>
      prev.map((t) =>
        t.id === ticketId ? { ...t, messages: [...(t.messages || []), msg] } : t
      )
    );
    return msg;
  }

  return (
    <TicketContext.Provider value={{ tickets, loading, loadTicket, addTicket, updateTicket, addMessage, deleteTicket }}>
      {children}
    </TicketContext.Provider>
  );
}

// eslint-disable-next-line react-refresh/only-export-components
export function useTickets() {
  const ctx = useContext(TicketContext);
  if (!ctx) throw new Error('useTickets must be used within a TicketProvider');
  return ctx;
}
