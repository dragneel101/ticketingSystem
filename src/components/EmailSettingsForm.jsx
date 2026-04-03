import { useState, useEffect } from 'react';
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

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch('/api/settings');
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Failed to load settings');

        setHost(data.smtp_host        ?? '');
        setPort(String(data.smtp_port ?? 587));
        setUser(data.smtp_user        ?? '');
        setFrom(data.smtp_from        ?? '');
        setSupportEmail(data.support_email ?? '');
        setPassSet(Boolean(data.smtp_pass_set));
        setLoaded(true);
      } catch (err) {
        addToast(err.message, 'error');
      }
    }
    load();
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
      addToast('Email settings saved', 'success');
    } catch (err) {
      addToast(err.message, 'error');
    } finally {
      setSaving(false);
    }
  }

  if (!loaded) {
    return (
      <p style={{ color: 'var(--gray-500)', fontSize: '0.875rem', padding: '4px 0' }}>
        Loading…
      </p>
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
        <button type="submit" className="btn-primary" disabled={saving}>
          {saving ? 'Saving…' : 'Save Email Settings'}
        </button>
      </div>
    </form>
  );
}
