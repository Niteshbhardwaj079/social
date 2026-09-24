import { useEffect, useState } from 'react';
import Icon from '../../components/common/Icon';
import ErrorState from '../../components/common/ErrorState';
import ConfirmDialog from '../../components/common/ConfirmDialog';
import TextField from '../../components/forms/TextField';
import PasswordField from '../../components/forms/PasswordField';
import { SkeletonKpiRow } from '../../components/common/LoadingSkeleton';
import { getEmailSettings, saveEmailSettings, disconnectEmailSettings, testEmailSettings, sendTestEmail } from '../../services/api/emailSettingsApi';
import { REQUEST_STATUS } from '../../config/constants';
import { formatDate } from '../../utils/formatters';
import { useToast } from '../../components/common/ToastProvider';
import { useSelector } from 'react-redux';

const TEST = { IDLE: 'idle', RUNNING: 'running', OK: 'ok', FAILED: 'failed' };

const EMPTY_FORM = { host: '', port: 587, secure: false, username: '', password: '', fromEmail: '', fromName: '' };

function formFromSaved(saved) {
  return { host: saved.host, port: saved.port, secure: saved.secure, username: saved.username, password: '', fromEmail: saved.fromEmail, fromName: saved.fromName };
}

function EmailSettings() {
  const { showToast } = useToast();
  const currentUserEmail = useSelector((state) => state.auth.currentUser?.email) || '';

  const [requestStatus, setRequestStatus] = useState(REQUEST_STATUS.LOADING);
  const [saved, setSaved] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [testState, setTestState] = useState({ status: TEST.IDLE, message: '' });
  const [isSaving, setIsSaving] = useState(false);
  const [isDisconnectOpen, setIsDisconnectOpen] = useState(false);

  const [recipient, setRecipient] = useState('');
  const [sendState, setSendState] = useState({ status: TEST.IDLE, message: '' });

  function applySettings(settings) {
    setSaved(settings);
    setForm(formFromSaved(settings));
    setRecipient((current) => current || currentUserEmail);
  }

  function load() {
    setRequestStatus(REQUEST_STATUS.LOADING);
    getEmailSettings()
      .then((settings) => {
        applySettings(settings);
        setRequestStatus(REQUEST_STATUS.SUCCEEDED);
      })
      .catch(() => setRequestStatus(REQUEST_STATUS.FAILED));
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (requestStatus === REQUEST_STATUS.LOADING) return <SkeletonKpiRow count={1} />;
  if (requestStatus === REQUEST_STATUS.FAILED) return <ErrorState onRetry={load} />;

  const isRunning = testState.status === TEST.RUNNING;
  const isSending = sendState.status === TEST.RUNNING;

  function handleFieldChange(key, value) {
    setForm((current) => ({ ...current, [key]: value }));
    setTestState({ status: TEST.IDLE, message: '' });
  }

  function runTest() {
    setTestState({ status: TEST.RUNNING, message: '' });
    testEmailSettings(form).then((result) => {
      setTestState({ status: result.ok ? TEST.OK : TEST.FAILED, message: result.message });
    });
  }

  function handleSave(event) {
    event.preventDefault();
    setIsSaving(true);
    saveEmailSettings(form)
      .then((settings) => {
        applySettings(settings);
        setTestState({ status: TEST.IDLE, message: '' });
        showToast({ type: 'success', title: 'Email settings saved', message: 'Outgoing email will now be sent from your own address.' });
      })
      .catch((error) => showToast({ type: 'error', title: 'Could not save', message: error.message }))
      .finally(() => setIsSaving(false));
  }

  function handleDisconnectConfirmed() {
    disconnectEmailSettings().then((settings) => {
      applySettings(settings);
      setIsDisconnectOpen(false);
      showToast({ type: 'info', title: 'Email settings disconnected', message: 'Emails will be recorded but not sent until you connect one again.' });
    });
  }

  function handleSendTest(event) {
    event.preventDefault();
    if (!recipient.trim()) return;
    setSendState({ status: TEST.RUNNING, message: '' });
    sendTestEmail(recipient.trim())
      .then((result) => {
        if (result.status === 'sent') {
          setSendState({ status: TEST.OK, message: `Sent to ${recipient.trim()}. Check its inbox (and spam folder).` });
        } else {
          setSendState({ status: TEST.FAILED, message: 'Nothing is connected yet, so this was only recorded, not actually sent. Save your settings above first.' });
        }
      })
      .catch((error) => setSendState({ status: TEST.FAILED, message: error.message }));
  }

  return (
    <div className="d-flex flex-column gap-5">
      <form className="surface-card" onSubmit={handleSave} noValidate>
        <h3 className="h5 mb-1">Email</h3>
        <p className="text-secondary-custom mb-4">
          Connect your own outgoing mail server (SMTP) so invitations, alerts and notifications are sent from your own address. Social never
          sends email on your behalf through a shared address.
        </p>

        {saved.configured ? (
          <div className="storage-status">
            <div className="storage-status__head">
              <span className="status-badge status-badge--connected">Connected</span>
              <strong>{saved.fromName ? `${saved.fromName} <${saved.fromEmail}>` : saved.fromEmail}</strong>
              <button type="button" className="btn btn-outline-secondary-custom text-danger ms-auto" onClick={() => setIsDisconnectOpen(true)}>
                Disconnect
              </button>
            </div>
            <dl className="storage-status__list">
              <div>
                <dt>Host</dt>
                <dd>
                  {saved.host}:{saved.port} {saved.secure ? '(TLS/SSL)' : ''}
                </dd>
              </div>
              {saved.username ? (
                <div>
                  <dt>Username</dt>
                  <dd>{saved.username}</dd>
                </div>
              ) : null}
              <div>
                <dt>Password</dt>
                <dd>{saved.passwordHint}</dd>
              </div>
              <div>
                <dt>Connected</dt>
                <dd>{formatDate(saved.connectedAt)}</dd>
              </div>
              <div>
                <dt>Last connection test</dt>
                <dd>
                  {formatDate(saved.lastTestedAt)} — {saved.lastTestMessage}
                </dd>
              </div>
            </dl>
          </div>
        ) : (
          <div className="callout-banner callout-banner--info">
            <Icon name="Info" size={16} />
            <span>No outgoing email connected yet. Emails are recorded but not sent until you connect one.</span>
          </div>
        )}

        <h4 className="h6 mt-4 mb-3">{saved.configured ? 'Change email settings' : 'Connect your email'}</h4>

        <div className="connect-form__grid">
          <TextField
            id="email-host"
            label={<>Host<span className="text-danger"> *</span></>}
            value={form.host}
            onChange={(event) => handleFieldChange('host', event.target.value)}
            placeholder="smtp.gmail.com"
            autoComplete="off"
            spellCheck={false}
          />
          <TextField
            id="email-port"
            label={<>Port<span className="text-danger"> *</span></>}
            type="number"
            value={form.port}
            onChange={(event) => handleFieldChange('port', event.target.value)}
            placeholder="587"
          />
          <TextField
            id="email-username"
            label="Username"
            value={form.username}
            onChange={(event) => handleFieldChange('username', event.target.value)}
            placeholder="you@yourcompany.com"
            autoComplete="off"
            spellCheck={false}
            hint="Leave blank if your server does not need a login."
          />
          <PasswordField
            id="email-password"
            label={<>Password<span className="text-danger"> *</span></>}
            value={form.password}
            onChange={(event) => handleFieldChange('password', event.target.value)}
            placeholder={saved.configured ? 'Leave blank to keep the current password' : 'Your SMTP password or app password'}
            autoComplete="off"
            hint={
              saved.configured
                ? 'Stored encrypted. Never shown again once saved — leave this blank to keep the current one.'
                : 'For Gmail, use a 16-character App Password, not your regular password.'
            }
          />
          <TextField
            id="email-fromEmail"
            label={<>From email<span className="text-danger"> *</span></>}
            type="email"
            value={form.fromEmail}
            onChange={(event) => handleFieldChange('fromEmail', event.target.value)}
            placeholder="no-reply@yourcompany.com"
            autoComplete="off"
          />
          <TextField
            id="email-fromName"
            label="From name"
            value={form.fromName}
            onChange={(event) => handleFieldChange('fromName', event.target.value)}
            placeholder="Your Company"
            autoComplete="off"
          />
          <div className="connect-form__field--wide">
            <div className="form-check form-switch mb-0">
              <input
                type="checkbox"
                className="form-check-input"
                role="switch"
                id="email-secure"
                checked={form.secure}
                onChange={(event) => handleFieldChange('secure', event.target.checked)}
              />
              <label htmlFor="email-secure" className="form-check-label">
                Use TLS/SSL (usually needed for port 465; leave off for 587 or 25)
              </label>
            </div>
          </div>
        </div>

        {testState.status === TEST.OK || testState.status === TEST.FAILED ? (
          <div className={`callout-banner callout-banner--${testState.status === TEST.OK ? 'success' : 'danger'}`} role="status">
            <Icon name={testState.status === TEST.OK ? 'CheckCircle2' : 'AlertCircle'} size={16} />
            <span>{testState.message}</span>
          </div>
        ) : null}

        <div className="connect-form__actions">
          <button type="button" className="btn btn-outline-secondary-custom" onClick={runTest} disabled={isRunning || isSaving}>
            {isRunning ? 'Testing...' : 'Test Connection'}
          </button>
          <button type="submit" className="btn btn-primary" disabled={isSaving}>
            {isSaving ? 'Saving...' : 'Save changes'}
          </button>
        </div>
      </form>

      {saved.configured ? (
        <form className="surface-card" onSubmit={handleSendTest}>
          <h3 className="h5 mb-1">Send a test email</h3>
          <p className="text-secondary-custom mb-4">Send a real email through your connected server to make sure it actually arrives.</p>
          <TextField
            id="email-test-recipient"
            label="Send to"
            type="email"
            value={recipient}
            onChange={(event) => setRecipient(event.target.value)}
            placeholder="you@yourcompany.com"
            autoComplete="off"
          />
          {sendState.status === TEST.OK || sendState.status === TEST.FAILED ? (
            <div className={`callout-banner callout-banner--${sendState.status === TEST.OK ? 'success' : 'danger'}`} role="status">
              <Icon name={sendState.status === TEST.OK ? 'CheckCircle2' : 'AlertCircle'} size={16} />
              <span>{sendState.message}</span>
            </div>
          ) : null}
          <button type="submit" className="btn btn-outline-secondary-custom" disabled={isSending || !recipient.trim()}>
            {isSending ? 'Sending...' : 'Send test email'}
          </button>
        </form>
      ) : null}

      <ConfirmDialog
        isOpen={isDisconnectOpen}
        onClose={() => setIsDisconnectOpen(false)}
        onConfirm={handleDisconnectConfirmed}
        title="Disconnect this email server?"
        message="Invitations, alerts and notifications will stop being sent until you connect one again — they will still be recorded, just not delivered."
        confirmLabel="Disconnect"
        isDanger
      />
    </div>
  );
}

export default EmailSettings;
