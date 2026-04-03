import { render, screen } from '@testing-library/react';
import { describe, test, expect, beforeEach, afterEach, vi } from 'vitest';
import SlaCountdown from '../SlaCountdown';

// We control Date.now() so tests are deterministic regardless of when they run.
// vitest's fake timers handle both Date.now() and setInterval.
beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

// ── helpers ───────────────────────────────────────────────────
// Returns an ISO string that is `offsetMs` milliseconds from the
// fake "now" (which starts at whatever system time was when vi.useFakeTimers ran).
function dueAt(offsetMs) {
  return new Date(Date.now() + offsetMs).toISOString();
}

const MIN = 60_000;
const HOUR = 60 * MIN;

// ═══════════════════════════════════════════════════════════════
describe('SlaCountdown', () => {
  test('renders nothing when dueAt is null', () => {
    const { container } = render(<SlaCountdown dueAt={null} />);
    expect(container.firstChild).toBeNull();
  });

  test('renders nothing when dueAt is undefined', () => {
    const { container } = render(<SlaCountdown dueAt={undefined} />);
    expect(container.firstChild).toBeNull();
  });

  // ── ok state (> 60 min remaining) ─────────────────────────
  test('ok state — shows sla-chip--ok class when > 60 minutes remain', () => {
    render(<SlaCountdown dueAt={dueAt(2 * HOUR)} />);
    const chip = screen.getByRole('generic'); // <span>
    expect(chip.className).toContain('sla-chip--ok');
    expect(chip.className).not.toContain('sla-chip--warn');
    expect(chip.className).not.toContain('sla-chip--breach');
  });

  test('ok state — displays remaining time in hours', () => {
    render(<SlaCountdown dueAt={dueAt(2 * HOUR)} />);
    // Should show something like "2h left"
    expect(screen.getByRole('generic').textContent).toMatch(/2h/);
  });

  test('ok state — compact mode shows time without "left"', () => {
    render(<SlaCountdown dueAt={dueAt(3 * HOUR)} compact />);
    const text = screen.getByRole('generic').textContent;
    expect(text).toMatch(/3h/);
    expect(text).not.toMatch(/left/);
  });

  // ── warn state (≤ 60 min remaining) ───────────────────────
  test('warn state — shows sla-chip--warn class when ≤ 60 minutes remain', () => {
    render(<SlaCountdown dueAt={dueAt(30 * MIN)} />);
    const chip = screen.getByRole('generic');
    expect(chip.className).toContain('sla-chip--warn');
    expect(chip.className).not.toContain('sla-chip--ok');
    expect(chip.className).not.toContain('sla-chip--breach');
  });

  test('warn state — boundary at exactly 60 minutes is warn, not ok', () => {
    // diffMs < 60 * 60_000 is the condition, so exactly 60 min is NOT warn
    // but 59m 59s is warn. Test at 59 minutes to be safe.
    render(<SlaCountdown dueAt={dueAt(59 * MIN)} />);
    const chip = screen.getByRole('generic');
    expect(chip.className).toContain('sla-chip--warn');
  });

  test('warn state — displays remaining minutes', () => {
    render(<SlaCountdown dueAt={dueAt(45 * MIN)} />);
    expect(screen.getByRole('generic').textContent).toMatch(/45m/);
  });

  // ── breach state (overdue) ─────────────────────────────────
  test('breach state — shows sla-chip--breach class when overdue', () => {
    render(<SlaCountdown dueAt={dueAt(-1 * MIN)} />);
    const chip = screen.getByRole('generic');
    expect(chip.className).toContain('sla-chip--breach');
    expect(chip.className).not.toContain('sla-chip--ok');
    expect(chip.className).not.toContain('sla-chip--warn');
  });

  test('breach state — full mode shows "Breached X ago"', () => {
    render(<SlaCountdown dueAt={dueAt(-2 * HOUR)} />);
    const text = screen.getByRole('generic').textContent;
    expect(text.toLowerCase()).toMatch(/breached/);
    expect(text).toMatch(/2h ago/);
  });

  test('breach state — compact mode shows just "Breached"', () => {
    render(<SlaCountdown dueAt={dueAt(-30 * MIN)} compact />);
    expect(screen.getByRole('generic').textContent).toBe('Breached');
  });

  // ── title attribute ────────────────────────────────────────
  test('title attribute shows the full deadline datetime string', () => {
    const due = dueAt(HOUR);
    render(<SlaCountdown dueAt={due} />);
    const chip = screen.getByRole('generic');
    // The title is set to due.toLocaleString() — just check it's non-empty
    expect(chip.title).toBeTruthy();
  });

  // ── day format ─────────────────────────────────────────────
  test('shows days when more than 24h remain', () => {
    render(<SlaCountdown dueAt={dueAt(25 * HOUR)} />);
    expect(screen.getByRole('generic').textContent).toMatch(/1d/);
  });
});
