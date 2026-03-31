import { useState, useEffect } from 'react';

/**
 * Renders a colour-coded countdown chip for an SLA deadline.
 *
 * @param {string|null} dueAt   - ISO 8601 deadline string (or null = no SLA)
 * @param {boolean}     compact - when true shows a shorter label (for list rows)
 */
export default function SlaCountdown({ dueAt, compact = false }) {
  // Re-render every minute so the countdown stays live.
  const [, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 60_000);
    return () => clearInterval(id);
  }, []);

  if (!dueAt) return null;

  const due    = new Date(dueAt);
  const diffMs = due - Date.now();
  const isBreached = diffMs <= 0;

  let label;
  let chipClass;

  if (isBreached) {
    chipClass = 'sla-chip sla-chip--breach';
    label = compact ? 'Breached' : `Breached ${formatAgo(Math.abs(diffMs))} ago`;
  } else {
    const remaining = formatRemaining(diffMs);
    // Warn when under 60 minutes remain
    chipClass = diffMs < 60 * 60_000 ? 'sla-chip sla-chip--warn' : 'sla-chip sla-chip--ok';
    label = compact ? remaining : `${remaining} left`;
  }

  return (
    <span className={chipClass} title={due.toLocaleString()}>
      {label}
    </span>
  );
}

function formatRemaining(ms) {
  const totalMin = Math.floor(ms / 60_000);
  if (totalMin < 60) return `${totalMin}m`;
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  if (h < 24) return m > 0 ? `${h}h ${m}m` : `${h}h`;
  const d = Math.floor(h / 24);
  const rh = h % 24;
  return rh > 0 ? `${d}d ${rh}h` : `${d}d`;
}

function formatAgo(ms) {
  const totalMin = Math.floor(ms / 60_000);
  if (totalMin < 60) return `${totalMin}m`;
  const h = Math.floor(totalMin / 60);
  if (h < 24) return `${h}h`;
  return `${Math.floor(h / 24)}d`;
}
