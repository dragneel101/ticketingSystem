import PasswordPolicyForm from './PasswordPolicyForm';

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
      </div>
    </div>
  );
}
