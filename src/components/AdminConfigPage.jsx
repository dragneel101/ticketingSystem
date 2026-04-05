import { useEffect, useRef, useState } from 'react';
import PasswordPolicyForm from './PasswordPolicyForm';
import SlaAdminPanel from './SlaAdminPanel';
import BoardsAdminPanel from './BoardsAdminPanel';
import EmailSettingsForm from './EmailSettingsForm';
import { useToast } from '../context/ToastContext';

// Inline form — single number input to control how often the SLA notifier polls.
function SlaNotifierSettings() {
  const { addToast } = useToast();
  const [intervalVal, setIntervalVal] = useState('');
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [savedBaseline, setSavedBaseline] = useState('');

  useEffect(() => {
    fetch('/api/settings')
      .then(r => r.json())
      .then(data => {
        const val = String(data.sla_check_interval_minutes ?? 5);
        setIntervalVal(val);
        setSavedBaseline(val);
        setLoaded(true);
      })
      .catch(() => addToast('Failed to load SLA notifier settings', 'error'));
  }, []);

  const isDirty = intervalVal !== savedBaseline;

  async function handleSave(e) {
    e.preventDefault();
    const parsed = parseInt(intervalVal, 10);
    if (isNaN(parsed) || parsed < 1) {
      addToast('Interval must be at least 1 minute', 'error');
      return;
    }
    setSaving(true);
    try {
      const res = await fetch('/api/settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sla_check_interval_minutes: parsed }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to save');
      const val = String(data.sla_check_interval_minutes);
      setIntervalVal(val);
      setSavedBaseline(val);
      addToast('SLA notifier interval updated', 'success');
    } catch (err) {
      addToast(err.message, 'error');
    } finally {
      setSaving(false);
    }
  }

  if (!loaded) return <p className="settings-loading">Loading…</p>;

  return (
    <form className="sla-notifier-form" onSubmit={handleSave}>
      <div className="sla-notifier-field">
        <label htmlFor="sla-interval" className="sla-notifier-label">
          Check interval
        </label>
        <div className="sla-notifier-input-row">
          <input
            id="sla-interval"
            type="number"
            min="1"
            max="1440"
            step="1"
            value={intervalVal}
            onChange={e => setIntervalVal(e.target.value)}
            className="sla-form-input sla-form-input--num"
          />
          <span className="sla-notifier-unit">minutes</span>
          <button
            type="submit"
            className={`btn btn--sm btn--brand`}
            disabled={!isDirty || saving}
          >
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
        <p className="sla-form-hint">
          How often SupportDesk checks for tickets approaching their SLA resolution deadline. Changes apply immediately without a server restart.
        </p>
      </div>
    </form>
  );
}

// SVG icons — inline so there's no external dependency.
// Each icon is a simple 20×20 path taken from a standard icon set.
function IconShield() {
  return (
    <svg width="18" height="18" viewBox="0 0 20 20" fill="none" aria-hidden="true">
      <path
        d="M10 2L3 5v5c0 4.418 3.134 8.55 7 9 3.866-.45 7-4.582 7-9V5l-7-3z"
        stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round"
      />
      <path d="M7 10l2 2 4-4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function IconClock() {
  return (
    <svg width="18" height="18" viewBox="0 0 20 20" fill="none" aria-hidden="true">
      <circle cx="10" cy="10" r="7.5" stroke="currentColor" strokeWidth="1.6" />
      <path d="M10 6.5V10l2.5 2.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function IconGrid() {
  return (
    <svg width="18" height="18" viewBox="0 0 20 20" fill="none" aria-hidden="true">
      <rect x="2.5" y="2.5" width="6" height="6" rx="1.5" stroke="currentColor" strokeWidth="1.6" />
      <rect x="11.5" y="2.5" width="6" height="6" rx="1.5" stroke="currentColor" strokeWidth="1.6" />
      <rect x="2.5" y="11.5" width="6" height="6" rx="1.5" stroke="currentColor" strokeWidth="1.6" />
      <rect x="11.5" y="11.5" width="6" height="6" rx="1.5" stroke="currentColor" strokeWidth="1.6" />
    </svg>
  );
}

function IconMail() {
  return (
    <svg width="18" height="18" viewBox="0 0 20 20" fill="none" aria-hidden="true">
      <rect x="2.5" y="4.5" width="15" height="11" rx="2" stroke="currentColor" strokeWidth="1.6" />
      <path d="M2.5 7.5l7.5 5 7.5-5" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
    </svg>
  );
}

const NAV_ITEMS = [
  { id: 'section-security',      label: 'Security',          Icon: IconShield },
  { id: 'section-sla',           label: 'SLA Policies',      Icon: IconClock  },
  { id: 'section-boards',        label: 'Boards',            Icon: IconGrid   },
  { id: 'section-email',         label: 'Email',             Icon: IconMail   },
];

// AdminConfigPage renders PasswordPolicyForm in "inline" mode — no modal chrome.
//
// The form component was designed as a modal, so it expects an onClose prop
// and renders its own backdrop + card wrapper. We sidestep all of that by:
//   1. Wrapping it in a container that uses CSS to suppress the modal overlay.
//   2. Passing a no-op onClose — the form calls it after a successful save and
//      on "Cancel". In page context, doing nothing is the right behavior: the
//      admin is already on the Settings page, there's nowhere to dismiss to.
//
// This lets PasswordPolicyForm remain a single component used in both contexts
// without any if/else branching inside it.
export default function AdminConfigPage() {
  const [activeSection, setActiveSection] = useState('section-security');
  const sectionRefs = useRef({});
  const observerRef = useRef(null);

  // Scroll-spy: track which section is most visible in the viewport.
  useEffect(() => {
    const threshold = [0, 0.1, 0.25, 0.5];

    const entries = new Map();

    observerRef.current = new IntersectionObserver(
      (observed) => {
        observed.forEach(entry => {
          entries.set(entry.target.id, entry.intersectionRatio);
        });
        // Pick the section with the highest visible ratio
        let best = null;
        let bestRatio = -1;
        entries.forEach((ratio, id) => {
          if (ratio > bestRatio) {
            bestRatio = ratio;
            best = id;
          }
        });
        if (best) setActiveSection(best);
      },
      { threshold, rootMargin: '-10% 0px -60% 0px' }
    );

    NAV_ITEMS.forEach(({ id }) => {
      const el = document.getElementById(id);
      if (el) observerRef.current.observe(el);
    });

    return () => observerRef.current?.disconnect();
  }, []);

  function scrollTo(id) {
    const el = document.getElementById(id);
    if (!el) return;
    el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  return (
    <div className="admin-page settings-admin-page">
      <div className="admin-page-header">
        <div className="admin-page-header-inner">
          <h1 className="admin-page-title">Admin Configuration</h1>
          <p className="admin-page-subtitle">Manage system-wide settings for your support portal.</p>
        </div>
      </div>

      <div className="settings-layout">
        {/* ── Sticky sidebar nav ───────────────────── */}
        <nav className="settings-sidenav" aria-label="Settings sections">
          <p className="settings-sidenav-label">Jump to</p>
          <ul className="settings-sidenav-list">
            {NAV_ITEMS.map(({ id, label, Icon }) => (
              <li key={id}>
                <button
                  className={`settings-sidenav-item${activeSection === id ? ' settings-sidenav-item--active' : ''}`}
                  onClick={() => scrollTo(id)}
                  type="button"
                >
                  <span className="settings-sidenav-icon"><Icon /></span>
                  <span>{label}</span>
                </button>
              </li>
            ))}
          </ul>
        </nav>

        {/* ── Main content column ──────────────────── */}
        <div className="admin-page-body settings-content-col">

          <section id="section-security" className="settings-section" ref={el => sectionRefs.current['section-security'] = el}>
            <div className="settings-card">
              <div className="sc-header">
                <div className="sc-header-icon sc-header-icon--security"><IconShield /></div>
                <div className="sc-header-text">
                  <h2 className="sc-header-title">Security</h2>
                  <p className="sc-header-desc">Set the minimum password length enforced for all agent and admin accounts when passwords are created or reset.</p>
                </div>
              </div>
              <div className="sc-body">
                <div className="inline-form-host">
                  <PasswordPolicyForm onClose={() => {}} />
                </div>
              </div>
            </div>
          </section>

          <section id="section-sla" className="settings-section" ref={el => sectionRefs.current['section-sla'] = el}>
            <div className="settings-card">
              <div className="sc-header">
                <div className="sc-header-icon sc-header-icon--sla"><IconClock /></div>
                <div className="sc-header-text">
                  <h2 className="sc-header-title">SLA Policies</h2>
                  <p className="sc-header-desc">Define first-response and resolution time targets per priority level. Assign custom policies to specific companies to override the default.</p>
                </div>
              </div>
              <div className="sc-body">
                <SlaAdminPanel />
                <div className="sla-notifier-divider" />
                <SlaNotifierSettings />
              </div>
            </div>
          </section>

          <section id="section-boards" className="settings-section" ref={el => sectionRefs.current['section-boards'] = el}>
            <div className="settings-card">
              <div className="sc-header">
                <div className="sc-header-icon sc-header-icon--boards"><IconGrid /></div>
                <div className="sc-header-text">
                  <h2 className="sc-header-title">Boards</h2>
                  <p className="sc-header-desc">Boards represent team queues (e.g. L1 Support, Dev Team). Tickets can be assigned to a board for routing and filtering.</p>
                </div>
              </div>
              <div className="sc-body">
                <BoardsAdminPanel />
              </div>
            </div>
          </section>

          <section id="section-email" className="settings-section" ref={el => sectionRefs.current['section-email'] = el}>
            <div className="settings-card">
              <div className="sc-header">
                <div className="sc-header-icon sc-header-icon--email"><IconMail /></div>
                <div className="sc-header-text">
                  <h2 className="sc-header-title">Email / Notifications</h2>
                  <p className="sc-header-desc">Configure SMTP credentials for outbound email. Used for ticket assignment notifications and SLA deadline warnings. Env vars (<code>SMTP_HOST</code>, <code>SMTP_USER</code>, etc.) remain active as fallback when these fields are empty.</p>
                </div>
              </div>
              <div className="sc-body sc-body--flush">
                <EmailSettingsForm />
              </div>
            </div>
          </section>

        </div>
      </div>
    </div>
  );
}
