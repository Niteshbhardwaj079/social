import { useEffect, useState } from 'react';
import { useSelector } from 'react-redux';
import Icon from '../../components/common/Icon';
import ErrorState from '../../components/common/ErrorState';
import ConfirmDialog from '../../components/common/ConfirmDialog';
import TextField from '../../components/forms/TextField';
import PasswordField from '../../components/forms/PasswordField';
import PageLoader from '../../components/common/PageLoader';
import { getEmailSettings, saveEmailProvider, disconnectEmailProvider, testEmailProvider, sendTestEmail } from '../../services/api/emailSettingsApi';
import { EMAIL_PROVIDERS, getEmailProvider, uiKeyForSaved } from '../../config/emailProviders';
import { REQUEST_STATUS } from '../../config/constants';
import { formatDate } from '../../utils/formatters';
import { useToast } from '../../components/common/ToastProvider';
import { useI18n } from '../../i18n/useI18n';
import brand from '../../config/brand';

const TEST = { IDLE: 'idle', RUNNING: 'running', OK: 'ok', FAILED: 'failed' };
const DEFAULT_UI_KEY = EMAIL_PROVIDERS[0].key;

function isConnectedToThis(saved, uiKey) {
  return Boolean(saved.provider) && uiKeyForSaved(saved.provider.providerKey, saved.provider.values) === uiKey;
}

/** Builds the form's starting values for whichever provider is selected — from the saved
 *  connection when it's this exact one, else that provider's own (often empty) defaults. */
function valuesFromSaved(provider, savedProvider, connected) {
  const values = {};
  for (const field of provider.fields) {
    values[field.key] = field.secret ? '' : connected ? (savedProvider.values[field.key] ?? '') : '';
  }
  if (provider.backendKey === 'smtp') {
    values.host = provider.locked ? provider.host : connected ? savedProvider.values.host || '' : '';
    values.port = provider.locked ? provider.port : connected ? savedProvider.values.port || 587 : provider.port;
    values.secure = provider.locked ? provider.secure : connected ? Boolean(savedProvider.values.secure) : provider.secure;
  }
  return values;
}

function EmailSettings() {
  const { t } = useI18n();
  const { showToast } = useToast();
  const currentUserEmail = useSelector((state) => state.auth.currentUser?.email) || '';

  const [requestStatus, setRequestStatus] = useState(REQUEST_STATUS.LOADING);
  const [saved, setSaved] = useState(null);
  const [uiKey, setUiKey] = useState(DEFAULT_UI_KEY);
  const [values, setValues] = useState({});
  const [testState, setTestState] = useState({ status: TEST.IDLE, message: '' });
  const [isSaving, setIsSaving] = useState(false);
  const [isDisconnectOpen, setIsDisconnectOpen] = useState(false);

  const [recipient, setRecipient] = useState('');
  const [sendState, setSendState] = useState({ status: TEST.IDLE, message: '' });

  function applySettings(settings) {
    setSaved(settings);
    const activeKey = settings.provider ? uiKeyForSaved(settings.provider.providerKey, settings.provider.values) : DEFAULT_UI_KEY;
    setUiKey(activeKey);
    setValues(valuesFromSaved(getEmailProvider(activeKey), settings.provider, isConnectedToThis(settings, activeKey)));
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

  if (requestStatus === REQUEST_STATUS.LOADING) return <PageLoader minHeight="24rem" />;
  if (requestStatus === REQUEST_STATUS.FAILED) return <ErrorState onRetry={load} />;

  const provider = getEmailProvider(uiKey);
  const connected = isConnectedToThis(saved, uiKey);
  const isSmtp = provider.backendKey === 'smtp';
  const isRunning = testState.status === TEST.RUNNING;
  const isSending = sendState.status === TEST.RUNNING;

  function handleFieldChange(key, value) {
    setValues((current) => ({ ...current, [key]: value }));
    setTestState({ status: TEST.IDLE, message: '' });
  }

  function handleProviderChange(nextKey) {
    setUiKey(nextKey);
    setValues(valuesFromSaved(getEmailProvider(nextKey), saved.provider, isConnectedToThis(saved, nextKey)));
    setTestState({ status: TEST.IDLE, message: '' });
  }

  function runTest() {
    setTestState({ status: TEST.RUNNING, message: '' });
    testEmailProvider(uiKey, values).then((result) => {
      setTestState({ status: result.ok ? TEST.OK : TEST.FAILED, message: result.message });
    });
  }

  function handleSave(event) {
    event.preventDefault();
    setIsSaving(true);
    saveEmailProvider(uiKey, values)
      .then((settings) => {
        applySettings(settings);
        setTestState({ status: TEST.IDLE, message: '' });
        showToast({ type: 'success', title: t('settings.email.savedToast'), message: t('settings.email.savedMessage') });
      })
      .catch((error) => showToast({ type: 'error', title: t('settings.email.couldNotSaveTitle'), message: error.message }))
      .finally(() => setIsSaving(false));
  }

  function handleDisconnectConfirmed() {
    disconnectEmailProvider().then((settings) => {
      applySettings(settings);
      setIsDisconnectOpen(false);
      showToast({ type: 'info', title: t('settings.email.disconnectedToast'), message: t('settings.email.disconnectedMessage') });
    });
  }

  function handleSendTest(event) {
    event.preventDefault();
    if (!recipient.trim()) return;
    setSendState({ status: TEST.RUNNING, message: '' });
    sendTestEmail(recipient.trim())
      .then((result) => {
        if (result.status === 'sent') {
          setSendState({ status: TEST.OK, message: t('settings.email.sentMessage', { recipient: recipient.trim() }) });
        } else {
          setSendState({ status: TEST.FAILED, message: t('settings.email.notConnectedMessage') });
        }
      })
      .catch((error) => setSendState({ status: TEST.FAILED, message: error.message }));
  }

  const connectedProviderLabel = saved.provider ? getEmailProvider(uiKeyForSaved(saved.provider.providerKey, saved.provider.values)).label : '';

  return (
    <div className="d-flex flex-column gap-5">
      <form className="surface-card" onSubmit={handleSave} noValidate>
        <h3 className="h5 mb-1">{t('settings.email.title')}</h3>
        <p className="text-secondary-custom mb-4">
          {t('settings.email.subtitle', { product: brand.productName })}
        </p>

        {saved.provider ? (
          <div className="storage-status">
            <div className="storage-status__head">
              <span className="status-badge status-badge--connected">{t('common.status.connected')}</span>
              <strong>{connectedProviderLabel}</strong>
              <button type="button" className="btn btn-outline-secondary-custom text-danger ms-auto" onClick={() => setIsDisconnectOpen(true)}>
                {t('socialAccounts.disconnect')}
              </button>
            </div>
            <dl className="storage-status__list">
              {saved.provider.providerKey === 'smtp' ? (
                <div>
                  <dt>{t('settings.email.hostLabel')}</dt>
                  <dd>
                    {saved.provider.values.host}:{saved.provider.values.port} {saved.provider.values.secure ? t('settings.email.tlsSslSuffix') : ''}
                  </dd>
                </div>
              ) : null}
              {saved.provider.values.username ? (
                <div>
                  <dt>{t('settings.email.usernameDt')}</dt>
                  <dd>{saved.provider.values.username}</dd>
                </div>
              ) : null}
              {Object.entries(saved.provider.secretHints).map(([key, hint]) => (
                <div key={key}>
                  <dt>{key === 'apiKey' ? t('settings.email.apiKeyDt') : t('settings.email.passwordDt')}</dt>
                  <dd>{hint}</dd>
                </div>
              ))}
              <div>
                <dt>{t('settings.email.fromDt')}</dt>
                <dd>{saved.provider.values.fromName ? `${saved.provider.values.fromName} <${saved.provider.values.fromEmail}>` : saved.provider.values.fromEmail}</dd>
              </div>
              <div>
                <dt>{t('settings.storage.connectedDt')}</dt>
                <dd>{formatDate(saved.provider.connectedAt)}</dd>
              </div>
              <div>
                <dt>{t('settings.storage.lastTestDt')}</dt>
                <dd>
                  {formatDate(saved.provider.lastTestedAt)} — {saved.provider.lastTestMessage}
                </dd>
              </div>
            </dl>
          </div>
        ) : (
          <div className="callout-banner callout-banner--info">
            <Icon name="Info" size={16} />
            <span>{t('settings.email.noneConnectedBanner')}</span>
          </div>
        )}

        <h4 className="h6 mt-4 mb-3">{saved.provider ? t('settings.email.changeSettings') : t('settings.email.connectYours')}</h4>

        <div className="mb-4">
          <label htmlFor="email-provider" className="form-label-custom">
            {t('settings.email.providerLabel')}
          </label>
          <select id="email-provider" className="form-select" value={uiKey} onChange={(event) => handleProviderChange(event.target.value)}>
            {EMAIL_PROVIDERS.map((item) => (
              <option key={item.key} value={item.key}>
                {item.label}
              </option>
            ))}
          </select>
          <div className="form-hint">
            {provider.summary}
            {provider.locked ? t('settings.email.usesHostPort', { host: provider.host, port: provider.port }) : ''}
          </div>
        </div>

        {provider.caution ? (
          <div className="callout-banner callout-banner--warning">
            <Icon name="AlertTriangle" size={16} />
            <span>{provider.caution}</span>
          </div>
        ) : null}

        {provider.steps ? (
          <details className="storage-guide" open={!connected}>
            <summary>{t('settings.storage.howToGetDetails')}</summary>
            <ol className="connect-guide__steps">
              {provider.steps.map((step) => (
                <li key={step}>{step}</li>
              ))}
            </ol>
            {provider.providerUrl ? (
              <a href={provider.providerUrl} target="_blank" rel="noopener noreferrer" className="btn btn-outline-primary-custom mb-3">
                <Icon name="ExternalLink" size={16} />
                {provider.providerLabel}
              </a>
            ) : null}
          </details>
        ) : null}

        <div className="connect-form__grid mt-4">
          {isSmtp && !provider.locked ? (
            <>
              <TextField
                id="email-host"
                label={<>{t('settings.email.hostLabel')}<span className="text-danger"> *</span></>}
                value={values.host}
                onChange={(event) => handleFieldChange('host', event.target.value)}
                placeholder="smtp.gmail.com"
                autoComplete="off"
                spellCheck={false}
              />
              <TextField
                id="email-port"
                label={<>{t('settings.email.portLabel')}<span className="text-danger"> *</span></>}
                type="number"
                value={values.port}
                onChange={(event) => handleFieldChange('port', event.target.value)}
                placeholder="587"
              />
            </>
          ) : null}

          {provider.fields.map((field) => {
            const Field = field.secret ? PasswordField : TextField;
            const hint = field.secret && connected ? t('settings.email.secretHintConnected') : field.hint;
            return (
              <Field
                key={`${uiKey}-${field.key}`}
                id={`email-${field.key}`}
                label={
                  <>
                    {field.label}
                    {field.required ? <span className="text-danger"> *</span> : null}
                  </>
                }
                {...(field.secret ? {} : { type: field.type === 'email' ? 'email' : 'text' })}
                value={values[field.key] || ''}
                onChange={(event) => handleFieldChange(field.key, event.target.value)}
                placeholder={field.secret && connected ? t('settings.email.secretPlaceholderConnected') : field.placeholder}
                autoComplete="off"
                spellCheck={false}
                hint={hint}
              />
            );
          })}

          {isSmtp && !provider.locked ? (
            <div className="connect-form__field--wide">
              <div className="form-check form-switch mb-0">
                <input
                  type="checkbox"
                  className="form-check-input"
                  role="switch"
                  id="email-secure"
                  checked={values.secure}
                  onChange={(event) => handleFieldChange('secure', event.target.checked)}
                />
                <label htmlFor="email-secure" className="form-check-label">
                  {t('settings.email.tlsSwitchLabel')}
                </label>
              </div>
            </div>
          ) : null}
        </div>

        {testState.status === TEST.OK || testState.status === TEST.FAILED ? (
          <div className={`callout-banner callout-banner--${testState.status === TEST.OK ? 'success' : 'danger'}`} role="status">
            <Icon name={testState.status === TEST.OK ? 'CheckCircle2' : 'AlertCircle'} size={16} />
            <span>
              {testState.message}
              {testState.status === TEST.OK ? t('settings.email.testOkSuffix') : ''}
            </span>
          </div>
        ) : null}

        <div className="connect-form__actions">
          <button type="button" className="btn btn-outline-secondary-custom" onClick={runTest} disabled={isRunning || isSaving}>
            {isRunning ? t('settings.email.testingEllipsis') : t('settings.email.testConnection')}
          </button>
          <button type="submit" className="btn btn-primary" disabled={isSaving}>
            {isSaving ? t('common.saving') : t('common.saveChanges')}
          </button>
        </div>
        <div className="form-hint mt-2">{t('settings.email.testHint')}</div>
      </form>

      {saved.provider ? (
        <form className="surface-card" onSubmit={handleSendTest}>
          <h3 className="h5 mb-1">{t('settings.email.sendTestTitle')}</h3>
          <p className="text-secondary-custom mb-4">{t('settings.email.sendTestSubtitle')}</p>
          <TextField
            id="email-test-recipient"
            label={t('settings.email.sendToLabel')}
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
            {isSending ? t('settings.email.sendingEllipsis') : t('settings.email.sendTestEmail')}
          </button>
        </form>
      ) : null}

      <ConfirmDialog
        isOpen={isDisconnectOpen}
        onClose={() => setIsDisconnectOpen(false)}
        onConfirm={handleDisconnectConfirmed}
        title={t('settings.email.disconnectConfirmTitle')}
        message={t('settings.email.disconnectConfirmMessage')}
        confirmLabel={t('socialAccounts.disconnect')}
        isDanger
      />
    </div>
  );
}

export default EmailSettings;
