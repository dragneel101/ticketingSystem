import { useState, useEffect, useRef } from 'react';
import { useToast } from '../context/ToastContext';

export default function EmailSettingsForm() {
  const { addToast } = useToast();

  // null = still loading; once the GET resolves, all fields are strings/numbers.
  const [loaded, setLoaded] = useState(false);

  const [host, setHost]               = useState('');
  const [port, setPort]               = useState('587');
  const [user, setUser]               = useState('');
  const [pass, setPass]               = useState('');
  const [from, setFrom]               = useState('');
  const [supportEmail, setSupportEmail] = useState('');

  // True when the server has a password saved — used for placeholder hint only.
  // We never receive the actual password from the API.
  const [passSet, setPassSet] = useState(false);

  const [saving, setSaving] = useState(false);

  // Snapshot of last-saved values (excludes pass — see constraints).
  // Populated after initial load and after each successful save.
  const [savedState, setSavedState] = useState(null);

  // Brief "Saved" success feedback state.
  const [saved, setSaved] = useState(false);
  const savedTimerRef = useRef(null);

  // Derive dirty flag — button is only enabled when something actually changed.
  const isDirty = savedState !== null && (
    host        !== savedState.host        ||
    port        !== savedState.port        ||
    user        !== savedState.user        ||
    from        !== savedState.from        ||
    supportEmail !== savedState.supportEmail
  );

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch('/api/settings');
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Failed to load settings');

        const loadedHost         = data.smtp_host        ?? '';
        const loadedPort         = String(data.smtp_port ?? 587);
        const loadedUser         = data.smtp_user        ?? '';
        const loadedFrom         = data.smtp_from        ?? '';
        const loadedSupportEmail = data.support_email    ?? '';

        setHost(loadedHost);
        setPort(loadedPort);
        setUser(loadedUser);
        setFrom(loadedFrom);
        setSupportEmail(loadedSupportEmail);
        setPassSet(Boolean(data.smtp_pass_set));

        // Capture baseline for dirty tracking.
        setSavedState({
          host:         loadedHost,
          port:         loadedPort,
          user:         loadedUser,
          from:         loadedFrom,
          supportEmail: loadedSupportEmail,
        });

        setLoaded(true);
      } catch (err) {
        addToast(err.message, 'error');
      }
    }
    load();

    // Cleanup any pending saved-flash timer on unmount.
    return () => {
      if (savedTimerRef.current) clearTimeout(savedTimerRef.current);
    };
  }, []);

  async function handleSubmit(e) {
    e.preventDefault();

    const parsedPort = parseInt(port, 10);
    if (isNaN(parsedPort) || parsedPort < 1 || parsedPort > 65535) {
      addToast('SMTP Port must be a number between 1 and 65535', 'error');
      return;
    }

    // Build payload — only include smtp_pass when the field has content.
    // An empty password field means "leave the existing password unchanged".
    const payload = {
      smtp_host:     host,
      smtp_port:     parsedPort,
      smtp_user:     user,
      smtp_from:     from,
      support_email: supportEmail,
    };
    if (pass !== '') {
      payload.smtp_pass = pass;
    }

    setSaving(true);
    try {
      const res = await fetch('/api/settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to save settings');

      // Update local pass hint from fresh server response
      setPassSet(Boolean(data.smtp_pass_set));
      // Clear the password field after a successful save so it returns
      // to placeholder mode — avoids leaving a cleartext password in the input.
      setPass('');

      // Advance the saved-state snapshot so isDirty resets to false.
      setSavedState({ host, port, user, from, supportEmail });

      // Flash the "Saved" success state for 2 seconds.
      setSaved(true);
      if (savedTimerRef.current) clearTimeout(savedTimerRef.current);
      savedTimerRef.current = setTimeout(() => setSaved(false), 2000);

      addToast('Email settings saved', 'success');
    } catch (err) {
      addToast(err.message, 'error');
    } finally {
      setSaving(false);
    }
  }

  if (!loaded) {
    return (
      <div className="esf-skeleton" aria-busy="true" aria-label="Loading email settings">
        <div className="esf-skeleton-grid">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="esf-skeleton-field">
              <span className="esf-skeleton-label" />
              <span className="esf-skeleton-input" />
            </div>
          ))}
        </div>
        <div className="esf-skeleton-footer">
          <span className="esf-skeleton-btn" />
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="email-settings-form">
      <div className="email-settings-grid">

        <div className="form-field">
          <label htmlFor="smtp-host">SMTP Host</label>
          <input
            id="smtp-host"
            type="text"
            value={host}
            placeholder="smtp.example.com"
            onChange={e => setHost(e.target.value)}
          />
        </div>

        <div className="form-field">
          <label htmlFor="smtp-port">SMTP Port</label>
          <input
            id="smtp-port"
            type="number"
            value={port}
            min={1}
            max={65535}
            step={1}
            onChange={e => setPort(e.target.value)}
          />
          <p className="form-field-hint">587 = STARTTLS (recommended), 465 = implicit TLS, 25 = unencrypted</p>
        </div>

        <div className="form-field">
          <label htmlFor="smtp-user">Username</label>
          <input
            id="smtp-user"
            type="text"
            value={user}
            placeholder="your@email.com"
            autoComplete="username"
            onChange={e => setUser(e.target.value)}
          />
        </div>

        <div className="form-field">
          <label htmlFor="smtp-pass">Password</label>
          <input
            id="smtp-pass"
            type="password"
            value={pass}
            // When a password is already saved, show bullets as placeholder.
            // An empty field on submit preserves the existing saved password.
            placeholder={passSet ? '\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022 (unchanged)' : ''}
            autoComplete="current-password"
            onChange={e => setPass(e.target.value)}
          />
          {passSet && pass === '' && (
            <p className="form-field-hint">Leave blank to keep the existing password.</p>
          )}
        </div>

        <div className="form-field">
          <label htmlFor="smtp-from">From Address</label>
          <input
            id="smtp-from"
            type="email"
            value={from}
            placeholder="noreply@yourcompany.com"
            onChange={e => setFrom(e.target.value)}
          />
          <p className="form-field-hint">The &quot;From&quot; address on all outbound emails.</p>
        </div>

        <div className="form-field">
          <label htmlFor="support-email">Support Email</label>
          <input
            id="support-email"
            type="email"
            value={supportEmail}
            placeholder="support@yourcompany.com"
            onChange={e => setSupportEmail(e.target.value)}
          />
          <p className="form-field-hint">Fallback recipient for unassigned tickets and SLA warnings.</p>
        </div>

      </div>

      <div className="email-settings-footer">
        <button
          type="submit"
          className={`btn-primary${saved ? ' btn-primary--saved' : ''}`}
          disabled={!isDirty || saving}
          aria-label={saving ? 'Saving changes' : saved ? 'Changes saved' : 'Save changes'}
        >
          {saving ? (
            <>
              <svg
                className="esf-spinner"
                width="14"
                height="14"
                viewBox="0 0 14 14"
                fill="none"
                aria-hidden="true"
              >
                <circle
                  cx="7"
                  cy="7"
                  r="5.5"
                  stroke="rgba(255,255,255,0.35)"
                  strokeWidth="2"
                />
                <path
                  d="M7 1.5 A5.5 5.5 0 0 1 12.5 7"
                  stroke="#fff"
                  strokeWidth="2"
                  strokeLinecap="round"
                />
              </svg>
              Saving…
            </>
          ) : saved ? (
            <>
              <svg
                className="esf-check"
                width="14"
                height="14"
                viewBox="0 0 14 14"
                fill="none"
                aria-hidden="true"
              >
                <path
                  d="M2.5 7.5 L5.5 10.5 L11.5 4"
                  stroke="#fff"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
              Saved
            </>
          ) : (
            'Save Changes'
          )}
        </button>
      </div>
    </form>
  );
}
