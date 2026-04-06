import { createContext, useContext, useState, useEffect } from 'react';

const TicketContext = createContext(null);

export function TicketProvider({ children }) {
  const [tickets, setTickets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [meta, setMeta] = useState({ total: 0, page: 1, hasMore: false });

  // Load first page on mount
  useEffect(() => {
    fetch('/api/tickets?page=1&limit=25')
      .then((r) => r.json())
      .then((data) => {
        setTickets(data.tickets);
        setMeta({ total: data.total, page: data.page, hasMore: data.hasMore });
      })
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
    setMeta((m) => ({ ...m, total: m.total + 1 }));
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
    setTickets((prev) =>
      prev.map((t) => {
        if (t.id !== id) return t;
        return { ...t, ...updated, events: t.events ?? [] };
      })
    );
  }

  async function deleteTicket(id) {
    const res = await fetch(`/api/tickets/${id}`, { method: 'DELETE' });
    if (!res.ok) throw new Error((await res.json()).error);
    setTickets((prev) => prev.filter((t) => t.id !== id));
    setMeta((m) => ({ ...m, total: Math.max(0, m.total - 1) }));
  }

  async function addMessage(ticketId, message) {
    const res = await fetch(`/api/tickets/${ticketId}/messages`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: message.from, text: message.text, type: message.type, notify_customer: message.notify_customer, attachment_ids: message.attachment_ids }),
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

  async function loadMoreTickets() {
    const nextPage = meta.page + 1;
    const res = await fetch(`/api/tickets?page=${nextPage}&limit=25`);
    if (!res.ok) throw new Error('Failed to load more tickets');
    const data = await res.json();
    setTickets((prev) => [...prev, ...data.tickets]);
    setMeta({ total: data.total, page: data.page, hasMore: data.hasMore });
  }

  return (
    <TicketContext.Provider
      value={{ tickets, setTickets, loading, meta, loadTicket, addTicket, updateTicket, addMessage, deleteTicket, loadMoreTickets }}
    >
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
