import PasswordPolicyForm from './PasswordPolicyForm';
import SlaAdminPanel from './SlaAdminPanel';
import BoardsAdminPanel from './BoardsAdminPanel';
import EmailSettingsForm from './EmailSettingsForm';

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
  return (
    <div className="admin-page">
      <div className="admin-page-header">
        <div className="admin-page-header-inner">
          <h1 className="admin-page-title">Admin Configuration</h1>
          <p className="admin-page-subtitle">Manage system-wide settings for your support portal.</p>
        </div>
      </div>

      <div className="admin-page-body">
        {/* Settings card — more cards can be added below as the app grows */}
        <section className="settings-section">
          <h2 className="settings-section-title">Security</h2>

          <div className="settings-card">
            {/* inline-form wrapper suppresses modal chrome via CSS */}
            <div className="inline-form-host">
              <PasswordPolicyForm onClose={() => {}} />
            </div>
          </div>
        </section>

        <section className="settings-section">
          <h2 className="settings-section-title">SLA Policies</h2>
          <div className="settings-card">
            <SlaAdminPanel />
          </div>
        </section>

        <section className="settings-section">
          <h2 className="settings-section-title">Boards</h2>
          <p className="settings-section-desc">Boards represent team queues (e.g. L1 Support, Dev Team). Tickets can be assigned to a board for routing and filtering.</p>
          <div className="settings-card">
            <BoardsAdminPanel />
          </div>
        </section>

        <section className="settings-section">
          <h2 className="settings-section-title">Email / Notifications</h2>
          <p className="settings-section-desc">Configure SMTP credentials for outbound email. Used for ticket assignment notifications and SLA deadline warnings. Env vars (<code>SMTP_HOST</code>, <code>SMTP_USER</code>, etc.) remain active as fallback when these fields are empty.</p>
          <div className="settings-card">
            <EmailSettingsForm />
          </div>
        </section>
      </div>
    </div>
  );
}
