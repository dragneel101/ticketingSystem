import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';
import TicketPage from '../TicketPage';

// ── Mock all three contexts ───────────────────────────────────
// TicketPage reads tickets from useTickets, fires toasts via useToast,
// and checks the current user's role via useAuth. We mock all three so
// the component renders in isolation without real providers or API calls.
vi.mock('../../context/TicketContext', () => ({ useTickets: vi.fn() }));
vi.mock('../../context/ToastContext',  () => ({ useToast:   vi.fn() }));
vi.mock('../../context/AuthContext',   () => ({ useAuth:    vi.fn() }));

import { useTickets } from '../../context/TicketContext';
import { useToast }   from '../../context/ToastContext';
import { useAuth }    from '../../context/AuthContext';

// ── Fixtures ──────────────────────────────────────────────────
const TICKET_ID = 'TKT-001';

const BASE_TICKET = {
  id: TICKET_ID,
  subject: 'Login is broken',
  customerEmail: 'user@example.com',
  customerName: 'Test User',
  phone: null,
  company: null,
  category: 'Technical',
  priority: 'high',
  status: 'open',
  assignedTo: null,
  assigneeName: null,
  assigneeEmail: null,
  resolution: null,
  createdAt: new Date().toISOString(),
  messages: [],
  events: [],
};

function makeEvent(overrides = {}) {
  return {
    id: Math.random(),
    eventType: 'status_changed',
    fromValue: 'open',
    toValue: 'pending',
    actorName: 'Test Agent',
    actorEmail: 'agent@example.com',
    createdAt: new Date().toISOString(),
    ...overrides,
  };
}

// ── Helpers ───────────────────────────────────────────────────
function setupWithTicket(ticket) {
  useToast.mockReturnValue({ addToast: vi.fn() });
  useAuth.mockReturnValue({ user: { id: 1, role: 'agent', name: 'Test Agent' } });
  useTickets.mockReturnValue({
    tickets: [ticket],
    loadTicket: vi.fn().mockResolvedValue(undefined),
    updateTicket: vi.fn().mockResolvedValue(ticket),
    deleteTicket: vi.fn(),
  });

  return {
    user: userEvent.setup(),
    ...render(<TicketPage ticketId={TICKET_ID} onBack={vi.fn()} />),
  };
}

beforeEach(() => {
  // TicketPage fetches /api/auth/agents for the assignee picker on mount.
  // Return an empty list — we don't care about the picker in these tests.
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve([]) })
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

// ═══════════════════════════════════════════════════════════════════════════
// Empty state
// ═══════════════════════════════════════════════════════════════════════════
describe('HistoryTab — empty state', () => {
  test('History tab button is present in the tab list', () => {
    setupWithTicket(BASE_TICKET);
    expect(screen.getByRole('tab', { name: /history/i })).toBeInTheDocument();
  });

  test('shows "No history yet" when the ticket has no events', async () => {
    const { user } = setupWithTicket({ ...BASE_TICKET, events: [] });

    await user.click(screen.getByRole('tab', { name: /history/i }));

    expect(screen.getByText(/no history yet/i)).toBeInTheDocument();
  });

  test('does not show an event-count badge when events are empty', () => {
    setupWithTicket({ ...BASE_TICKET, events: [] });
    // The badge only renders when events.length > 0 — there should be no count element
    const histTab = screen.getByRole('tab', { name: /history/i });
    expect(histTab.querySelector('.tp-tab-badge')).toBeNull();
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Populated timeline
// ═══════════════════════════════════════════════════════════════════════════
describe('HistoryTab — populated timeline', () => {
  test('shows an event-count badge on the History tab when events exist', () => {
    setupWithTicket({ ...BASE_TICKET, events: [makeEvent()] });
    // The badge span sits inside the tab button and shows the count
    expect(screen.getByText('1')).toBeInTheDocument();
  });

  test('renders one list item per event', async () => {
    const events = [
      makeEvent({ id: 1, eventType: 'status_changed' }),
      makeEvent({ id: 2, eventType: 'priority_changed' }),
    ];
    const { user } = setupWithTicket({ ...BASE_TICKET, events });

    await user.click(screen.getByRole('tab', { name: /history/i }));

    const list = screen.getByRole('list', { name: /ticket history/i });
    expect(list.querySelectorAll('li')).toHaveLength(2);
  });

  test('status_changed event shows actor name and from/to values', async () => {
    const event = makeEvent({
      eventType: 'status_changed',
      fromValue: 'open',
      toValue: 'resolved',
      actorName: 'Jane Support',
    });
    const { user } = setupWithTicket({ ...BASE_TICKET, events: [event] });

    await user.click(screen.getByRole('tab', { name: /history/i }));

    // Scope queries to the timeline to avoid clashing with the status badge in the header
    const list = screen.getByRole('list', { name: /ticket history/i });
    expect(within(list).getByText('Jane Support')).toBeInTheDocument();
    expect(within(list).getByText('open')).toBeInTheDocument();
    expect(within(list).getByText('resolved')).toBeInTheDocument();
  });

  test('assigned event shows actor name and the new assignee name', async () => {
    const event = makeEvent({
      eventType: 'assigned',
      fromValue: null,
      toValue: 'Bob Agent',
      actorName: 'Admin User',
    });
    const { user } = setupWithTicket({ ...BASE_TICKET, events: [event] });

    await user.click(screen.getByRole('tab', { name: /history/i }));

    expect(screen.getByText('Admin User')).toBeInTheDocument();
    expect(screen.getByText('Bob Agent')).toBeInTheDocument();
  });

  test('falls back to "Someone" when actorName is null', async () => {
    const event = makeEvent({ actorName: null });
    const { user } = setupWithTicket({ ...BASE_TICKET, events: [event] });

    await user.click(screen.getByRole('tab', { name: /history/i }));

    expect(screen.getByText('Someone')).toBeInTheDocument();
  });

  test('unknown event type renders the default fallback label', async () => {
    const event = makeEvent({ eventType: 'some_future_event', fromValue: null, toValue: null });
    const { user } = setupWithTicket({ ...BASE_TICKET, events: [event] });

    await user.click(screen.getByRole('tab', { name: /history/i }));

    // defaultLabel renders: "<actorName> performed some future event"
    expect(screen.getByText(/performed some future event/i)).toBeInTheDocument();
  });
});
