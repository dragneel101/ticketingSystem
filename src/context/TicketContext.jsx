import { createContext, useContext, useState } from 'react';

const initialTickets = [
  {
    id: 'TKT-001',
    subject: 'Unable to reset password',
    customerEmail: 'alice@example.com',
    category: 'Account',
    priority: 'high',
    status: 'open',
    createdAt: '2026-03-24T09:15:00Z',
    messages: [
      {
        from: 'alice@example.com',
        text: "I've been trying to reset my password for the past hour but I'm not receiving the email.",
        time: '2026-03-24T09:15:00Z',
      },
      {
        from: 'support@company.com',
        text: 'Hi Alice, sorry to hear that! Can you confirm the email address on your account?',
        time: '2026-03-24T09:32:00Z',
      },
    ],
  },
  {
    id: 'TKT-002',
    subject: 'Billing charge not matching invoice',
    customerEmail: 'bob@example.com',
    category: 'Billing',
    priority: 'urgent',
    status: 'pending',
    createdAt: '2026-03-25T14:02:00Z',
    messages: [
      {
        from: 'bob@example.com',
        text: 'My last invoice says $49 but my card was charged $59. Please investigate.',
        time: '2026-03-25T14:02:00Z',
      },
    ],
  },
  {
    id: 'TKT-003',
    subject: 'Feature request: dark mode',
    customerEmail: 'carol@example.com',
    category: 'Feature Request',
    priority: 'low',
    status: 'resolved',
    createdAt: '2026-03-20T11:45:00Z',
    messages: [
      {
        from: 'carol@example.com',
        text: 'Would love to see a dark mode option in the dashboard.',
        time: '2026-03-20T11:45:00Z',
      },
      {
        from: 'support@company.com',
        text: "Great suggestion! Dark mode is already on our roadmap for Q2. We'll notify you when it's live.",
        time: '2026-03-20T13:10:00Z',
      },
    ],
  },
];

const TicketContext = createContext(null);

export function TicketProvider({ children }) {
  const [tickets, setTickets] = useState(initialTickets);

  function addTicket(ticket) {
    setTickets((prev) => [
      ...prev,
      {
        id: `TKT-${String(prev.length + 1).padStart(3, '0')}`,
        createdAt: new Date().toISOString(),
        messages: [],
        ...ticket,
      },
    ]);
  }

  function updateTicket(id, changes) {
    setTickets((prev) =>
      prev.map((t) => (t.id === id ? { ...t, ...changes } : t))
    );
  }

  function addMessage(ticketId, message) {
    setTickets((prev) =>
      prev.map((t) =>
        t.id === ticketId
          ? { ...t, messages: [...t.messages, { ...message, time: new Date().toISOString() }] }
          : t
      )
    );
  }

  return (
    <TicketContext.Provider value={{ tickets, addTicket, updateTicket, addMessage }}>
      {children}
    </TicketContext.Provider>
  );
}

export function useTickets() {
  const ctx = useContext(TicketContext);
  if (!ctx) throw new Error('useTickets must be used within a TicketProvider');
  return ctx;
}
