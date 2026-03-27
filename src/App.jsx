import { TicketProvider, useTickets } from './context/TicketContext';

function TicketSummary() {
  const { tickets } = useTickets();

  const counts = tickets.reduce((acc, t) => {
    acc[t.status] = (acc[t.status] || 0) + 1;
    return acc;
  }, {});

  return (
    <div style={{ fontFamily: 'sans-serif', padding: '2rem' }}>
      <h1>Support Tickets</h1>
      <p>
        <strong>{tickets.length}</strong> ticket{tickets.length !== 1 ? 's' : ''} loaded —
        context is working.
      </p>
      <ul>
        {Object.entries(counts).map(([status, count]) => (
          <li key={status}>
            {status}: {count}
          </li>
        ))}
      </ul>
    </div>
  );
}

export default function App() {
  return (
    <TicketProvider>
      <TicketSummary />
    </TicketProvider>
  );
}
