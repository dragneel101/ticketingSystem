import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';
import DashboardPage from '../DashboardPage';

// ── Mock contexts ─────────────────────────────────────────────
vi.mock('../../context/TicketContext', () => ({
  useTickets: vi.fn(),
}));

vi.mock('../../context/AuthContext', () => ({
  useAuth: vi.fn(),
}));

// ── Mock lazy-loaded DashboardCharts ──────────────────────────
// DashboardCharts uses recharts which requires canvas — skip it
// in jsdom and just assert the section renders without charts.
vi.mock('../DashboardCharts', () => ({
  default: () => <div data-testid="dashboard-charts" />,
}));

import { useTickets } from '../../context/TicketContext';
import { useAuth } from '../../context/AuthContext';

// ── Helpers ───────────────────────────────────────────────────
function makeTicket(overrides = {}) {
  return {
    id: `TKT-${Math.floor(Math.random() * 900) + 100}`,
    subject: 'Test ticket subject',
    status: 'unassigned',
    priority: 'medium',
    assignedTo: null,
    createdAt: new Date().toISOString(),
    resolutionDueAt: null,
    messages: [],
    ...overrides,
  };
}

const ADMIN_USER = { id: 1, name: 'Admin', email: 'admin@example.com', role: 'admin' };
const AGENT_USER = { id: 2, name: 'Agent', email: 'agent@example.com', role: 'agent' };

beforeEach(() => {
  vi.useFakeTimers();
  useAuth.mockReturnValue({ user: ADMIN_USER });
  useTickets.mockReturnValue({ tickets: [], loading: false });
});

afterEach(() => {
  vi.useRealTimers();
  vi.clearAllMocks();
});

// ═══════════════════════════════════════════════════════════════
// Basic render
// ═══════════════════════════════════════════════════════════════
describe('DashboardPage — basic render', () => {
  test('shows loading spinner while tickets are loading', () => {
    useTickets.mockReturnValue({ tickets: [], loading: true });
    render(<DashboardPage onViewTicket={() => {}} onNavigate={() => {}} />);
    expect(screen.getByLabelText(/loading dashboard/i)).toBeInTheDocument();
  });

  test('renders dashboard title when loaded', () => {
    render(<DashboardPage onViewTicket={() => {}} onNavigate={() => {}} />);
    expect(screen.getByText('Dashboard')).toBeInTheDocument();
  });

  test('shows empty-state subtitle when there are no tickets', () => {
    render(<DashboardPage onViewTicket={() => {}} onNavigate={() => {}} />);
    expect(screen.getByText(/no tickets yet/i)).toBeInTheDocument();
  });
});

// ═══════════════════════════════════════════════════════════════
// SLA Breached stat card
// ═══════════════════════════════════════════════════════════════
describe('DashboardPage — SLA Breached stat card', () => {
  test('renders "SLA Breached" stat card', () => {
    useTickets.mockReturnValue({ tickets: [], loading: false });
    render(<DashboardPage onViewTicket={() => {}} onNavigate={() => {}} />);
    expect(screen.getByText('SLA Breached')).toBeInTheDocument();
  });

  test('shows 0 when no tickets are breached', () => {
    useTickets.mockReturnValue({ tickets: [makeTicket()], loading: false });
    render(<DashboardPage onViewTicket={() => {}} onNavigate={() => {}} />);
    // Find the stat card value next to "SLA Breached" label
    const label = screen.getByText('SLA Breached');
    const card = label.closest('.dash-stat-card');
    expect(card.querySelector('.dash-stat-value').textContent).toBe('0');
  });

  test('counts tickets with resolutionDueAt in the past and non-terminal status', () => {
    const pastDue = new Date(Date.now() - 60_000).toISOString();
    const tickets = [
      makeTicket({ resolutionDueAt: pastDue, status: 'in-progress' }),  // breached
      makeTicket({ resolutionDueAt: pastDue, status: 'resolved' }),      // terminal — excluded
      makeTicket({ resolutionDueAt: pastDue, status: 'closed' }),        // terminal — excluded
      makeTicket({ resolutionDueAt: null }),                              // no SLA — excluded
    ];
    useTickets.mockReturnValue({ tickets, loading: false });
    render(<DashboardPage onViewTicket={() => {}} onNavigate={() => {}} />);

    const label = screen.getByText('SLA Breached');
    const card = label.closest('.dash-stat-card');
    expect(card.querySelector('.dash-stat-value').textContent).toBe('1');
  });

  test('breach card gets --breach modifier class when count > 0', () => {
    const pastDue = new Date(Date.now() - 60_000).toISOString();
    useTickets.mockReturnValue({
      tickets: [makeTicket({ resolutionDueAt: pastDue, status: 'assigned' })],
      loading: false,
    });
    render(<DashboardPage onViewTicket={() => {}} onNavigate={() => {}} />);
    const label = screen.getByText('SLA Breached');
    const card = label.closest('.dash-stat-card');
    expect(card.className).toContain('dash-stat-card--breach');
  });

  test('breach card does NOT have --breach class when count is 0', () => {
    useTickets.mockReturnValue({ tickets: [], loading: false });
    render(<DashboardPage onViewTicket={() => {}} onNavigate={() => {}} />);
    const label = screen.getByText('SLA Breached');
    const card = label.closest('.dash-stat-card');
    expect(card.className).not.toContain('dash-stat-card--breach');
  });
});

// ═══════════════════════════════════════════════════════════════
// Breaching Soon section
// ═══════════════════════════════════════════════════════════════
describe('DashboardPage — Breaching Soon section', () => {
  test('section is hidden when no tickets are breaching soon', () => {
    useTickets.mockReturnValue({ tickets: [makeTicket()], loading: false });
    render(<DashboardPage onViewTicket={() => {}} onNavigate={() => {}} />);
    expect(screen.queryByText('Breaching Soon')).not.toBeInTheDocument();
  });

  test('section appears when a ticket is within 60 minutes of breach', () => {
    const soonDue = new Date(Date.now() + 30 * 60_000).toISOString(); // 30 min from now
    useTickets.mockReturnValue({
      tickets: [makeTicket({ resolutionDueAt: soonDue, status: 'in-progress' })],
      loading: false,
    });
    render(<DashboardPage onViewTicket={() => {}} onNavigate={() => {}} />);
    expect(screen.getByText('Breaching Soon')).toBeInTheDocument();
  });

  test('shows the breaching ticket subject', () => {
    const soonDue = new Date(Date.now() + 20 * 60_000).toISOString();
    useTickets.mockReturnValue({
      tickets: [makeTicket({ subject: 'My urgent ticket', resolutionDueAt: soonDue, status: 'assigned' })],
      loading: false,
    });
    render(<DashboardPage onViewTicket={() => {}} onNavigate={() => {}} />);
    expect(screen.getByText('My urgent ticket')).toBeInTheDocument();
  });

  test('excludes resolved and closed tickets from breaching soon', () => {
    const soonDue = new Date(Date.now() + 20 * 60_000).toISOString();
    useTickets.mockReturnValue({
      tickets: [
        makeTicket({ resolutionDueAt: soonDue, status: 'resolved' }),
        makeTicket({ resolutionDueAt: soonDue, status: 'closed' }),
      ],
      loading: false,
    });
    render(<DashboardPage onViewTicket={() => {}} onNavigate={() => {}} />);
    expect(screen.queryByText('Breaching Soon')).not.toBeInTheDocument();
  });

  test('caps the list at 5 tickets', () => {
    const soonDue = new Date(Date.now() + 20 * 60_000).toISOString();
    const tickets = Array.from({ length: 8 }, (_, i) =>
      makeTicket({ id: `TKT-${100 + i}`, subject: `Ticket ${i}`, resolutionDueAt: soonDue, status: 'unassigned' })
    );
    useTickets.mockReturnValue({ tickets, loading: false });
    render(<DashboardPage onViewTicket={() => {}} onNavigate={() => {}} />);
    // Only 5 View buttons should appear in the breaching-soon section
    const section = screen.getByLabelText(/tickets breaching sla soon/i);
    const viewButtons = section.querySelectorAll('button');
    expect(viewButtons.length).toBeLessThanOrEqual(5);
  });

  test('View button calls onViewTicket with the ticket id', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    const onViewTicket = vi.fn();
    const soonDue = new Date(Date.now() + 20 * 60_000).toISOString();
    const ticket = makeTicket({ id: 'TKT-042', resolutionDueAt: soonDue, status: 'in-progress' });
    useTickets.mockReturnValue({ tickets: [ticket], loading: false });

    render(<DashboardPage onViewTicket={onViewTicket} onNavigate={() => {}} />);
    await user.click(screen.getByRole('button', { name: /view ticket TKT-042/i }));
    expect(onViewTicket).toHaveBeenCalledWith('TKT-042');
  });

  test('badge shows count of breaching tickets', () => {
    const soonDue = new Date(Date.now() + 20 * 60_000).toISOString();
    const tickets = [
      makeTicket({ resolutionDueAt: soonDue, status: 'unassigned' }),
      makeTicket({ resolutionDueAt: soonDue, status: 'assigned' }),
    ];
    useTickets.mockReturnValue({ tickets, loading: false });
    render(<DashboardPage onViewTicket={() => {}} onNavigate={() => {}} />);
    expect(screen.getByText('2')).toBeInTheDocument();
  });
});

// ═══════════════════════════════════════════════════════════════
// Admin quick actions
// ═══════════════════════════════════════════════════════════════
describe('DashboardPage — admin quick actions', () => {
  test('shows quick actions section for admin', () => {
    render(<DashboardPage onViewTicket={() => {}} onNavigate={() => {}} />);
    expect(screen.getByText('Quick Actions')).toBeInTheDocument();
  });

  test('hides quick actions section for agent', () => {
    useAuth.mockReturnValue({ user: AGENT_USER });
    render(<DashboardPage onViewTicket={() => {}} onNavigate={() => {}} />);
    expect(screen.queryByText('Quick Actions')).not.toBeInTheDocument();
  });
});
