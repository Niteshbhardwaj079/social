import { useEffect, useState } from 'react';
import Icon from '../../components/common/Icon';
import ErrorState from '../../components/common/ErrorState';
import ConfirmDialog from '../../components/common/ConfirmDialog';
import TextField from '../../components/forms/TextField';
import PasswordField from '../../components/forms/PasswordField';
import PageLoader from '../../components/common/PageLoader';
import { STORAGE_PROVIDERS, STORAGE_LIMIT_UNITS, getStorageProvider } from '../../config/storageProviders';
import {
  getStorageSettings,
  saveStorageProvider,
  disconnectStorage,
  testStorageConnection,
  testStorageUpload,
  saveStoragePreferences,
} from '../../services/api/storageApi';
import { REQUEST_STATUS } from '../../config/constants';
import { formatDate } from '../../utils/formatters';
import { useToast } from '../../components/common/ToastProvider';
import { useI18n } from '../../i18n/useI18n';
import brand from '../../config/brand';

const TEST = { IDLE: 'idle', RUNNING: 'running', OK: 'ok', FAILED: 'failed' };

function valuesFromSaved(provider, savedProvider) {
  if (!savedProvider || savedProvider.providerKey !== provider.key) return {};
  return { ...savedProvider.values };
}

function StorageSettings() {
  const { t } = useI18n();
  const { showToast } = useToast();
  const [requestStatus, setRequestStatus] = useState(REQUEST_STATUS.LOADING);
  const [saved, setSaved] = useState(null);

  const [providerKey, setProviderKey] = useState(STORAGE_PROVIDERS[0].key);
  const [values, setValues] = useState({});
  const [testState, setTestState] = useState({ status: TEST.IDLE, kind: '', message: '' });
  const [isSavingProvider, setIsSavingProvider] = useState(false);
  const [isDisconnectOpen, setIsDisconnectOpen] = useState(false);

  const [preferences, setPreferences] = useState(null);
  const [isSavingPreferences, setIsSavingPreferences] = useState(false);

  function applySettings(settings) {
    setSaved(settings);
    setPreferences(settings.preferences);
    const activeKey = settings.provider?.providerKey || STORAGE_PROVIDERS[0].key;
    setProviderKey(activeKey);
    setValues(valuesFromSaved(getStorageProvider(activeKey), settings.provider));
  }

  function load() {
    setRequestStatus(REQUEST_STATUS.LOADING);
    getStorageSettings()
      .then((settings) => {
        applySettings(settings);
        setRequestStatus(REQUEST_STATUS.SUCCEEDED);
      })
      .catch(() => setRequestStatus(REQUEST_STATUS.FAILED));
  }

  useEffect(() => {
    load();
  }, []);

  if (requestStatus === REQUEST_STATUS.LOADING) return <PageLoader minHeight="24rem" />;
  if (requestStatus === REQUEST_STATUS.FAILED) return <ErrorState onRetry={load} />;

  const provider = getStorageProvider(providerKey);
  const connected = saved.provider;
  const isConnectedToThis = connected?.providerKey === providerKey;
  const isRunning = testState.status === TEST.RUNNING;
  const isPreferencesDirty = JSON.stringify(preferences) !== JSON.stringify(saved.preferences);

  function handleProviderChange(nextKey) {
    setProviderKey(nextKey);
    setValues(valuesFromSaved(getStorageProvider(nextKey), connected));
    setTestState({ status: TEST.IDLE, kind: '', message: '' });
  }

  function handleFieldChange(key, value) {
    setValues((current) => ({ ...current, [key]: value }));
    setTestState({ status: TEST.IDLE, kind: '', message: '' });
  }

  function runTest(kind) {
    setTestState({ status: TEST.RUNNING, kind, message: '' });
    const run = kind === 'upload' ? testStorageUpload : testStorageConnection;
    run(providerKey, values).then((result) => {
      setTestState({ status: result.ok ? TEST.OK : TEST.FAILED, kind, message: result.message });
    });
  }

  function handleSaveProvider(event) {
    event.preventDefault();
    setIsSavingProvider(true);
    saveStorageProvider(providerKey, values)
      .then((settings) => {
        applySettings(settings);
        setTestState({ status: TEST.IDLE, kind: '', message: '' });
        showToast({ type: 'success', title: t('settings.storage.savedToast'), message: t('settings.storage.savedMessage', { label: provider.label }) });
      })
      .catch((error) => showToast({ type: 'error', title: t('settings.storage.couldNotSaveTitle'), message: error.message }))
      .finally(() => setIsSavingProvider(false));
  }

  function handleDisconnectConfirmed() {
    disconnectStorage().then((settings) => {
      applySettings(settings);
      setIsDisconnectOpen(false);
      showToast({ type: 'info', title: t('settings.storage.disconnectedToast'), message: t('settings.storage.disconnectedMessage') });
    });
  }

  function handleSavePreferences(event) {
    event.preventDefault();
    setIsSavingPreferences(true);
    saveStoragePreferences(preferences)
      .then((settings) => {
        applySettings(settings);
        showToast({ type: 'success', title: t('settings.storage.preferencesSavedToast') });
      })
      .catch((error) => showToast({ type: 'error', title: t('settings.storage.couldNotSaveTitle'), message: error.message }))
      .finally(() => setIsSavingPreferences(false));
  }

  function setPreference(key, value) {
    setPreferences((current) => ({ ...current, [key]: value }));
  }

  const bothOff = !preferences.serverEnabled && !preferences.externalEnabled;

  return (
    <div className="d-flex flex-column gap-5">
      {/* ---------------------------------------------------------- Connect */}
      <form className="surface-card" onSubmit={handleSaveProvider} noValidate>
        <h3 className="h5 mb-1">{t('settings.storage.title')}</h3>
        <p className="text-secondary-custom mb-4">
          {t('settings.storage.subtitle', { product: brand.productName })}
        </p>

        {connected ? (
          <div className="storage-status">
            <div className="storage-status__head">
              <span className="status-badge status-badge--connected">{t('common.status.connected')}</span>
              <strong>{getStorageProvider(connected.providerKey)?.label}</strong>
              <button type="button" className="btn btn-outline-secondary-custom text-danger ms-auto" onClick={() => setIsDisconnectOpen(true)}>
                {t('socialAccounts.disconnect')}
              </button>
            </div>
            <dl className="storage-status__list">
              {Object.entries(connected.values)
                .filter(([, value]) => value)
                .map(([key, value]) => {
                  const field = getStorageProvider(connected.providerKey)?.fields.find((item) => item.key === key);
                  return (
                    <div key={key}>
                      <dt>{field?.label || key}</dt>
                      <dd>{value}</dd>
                    </div>
                  );
                })}
              {Object.entries(connected.secretHints).map(([key, hint]) => {
                const field = getStorageProvider(connected.providerKey)?.fields.find((item) => item.key === key);
                return (
                  <div key={key}>
                    <dt>{field?.label || key}</dt>
                    <dd>{hint}</dd>
                  </div>
                );
              })}
              <div>
                <dt>{t('settings.storage.connectedDt')}</dt>
                <dd>{formatDate(connected.connectedAt)}</dd>
              </div>
              <div>
                <dt>{t('settings.storage.lastTestDt')}</dt>
                <dd>
                  {formatDate(connected.lastTestedAt)} — {connected.lastTestMessage}
                </dd>
              </div>
            </dl>
          </div>
        ) : (
          <div className="callout-banner callout-banner--info">
            <Icon name="Info" size={16} />
            <span>{t('settings.storage.noneConnectedBanner')}</span>
          </div>
        )}

        <h4 className="h6 mt-4 mb-3">{connected ? t('settings.storage.connectOrChange') : t('settings.storage.connectNew')}</h4>

        <div className="mb-4">
          <label htmlFor="storageProvider" className="form-label-custom">
            {t('settings.storage.providerLabel')}
          </label>
          <select id="storageProvider" className="form-select" value={providerKey} onChange={(event) => handleProviderChange(event.target.value)}>
            {STORAGE_PROVIDERS.map((item) => (
              <option key={item.key} value={item.key}>
                {item.label}
              </option>
            ))}
          </select>
          <div className="form-hint">{provider.summary}</div>
        </div>

        {provider.caution ? (
          <div className="callout-banner callout-banner--warning">
            <Icon name="AlertTriangle" size={16} />
            <span>{provider.caution}</span>
          </div>
        ) : null}

        <details className="storage-guide" open={!isConnectedToThis}>
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

        <div className="connect-form__grid mt-4">
          {provider.fields.map((field) => {
            const isSecret = field.type === 'password';
            const Field = isSecret ? PasswordField : TextField;
            const hint = isSecret && isConnectedToThis
              ? t('settings.storage.secretHintConnected')
              : field.hint;
            return (
              <Field
                key={`${providerKey}-${field.key}`}
                id={`storage-${field.key}`}
                label={
                  <>
                    {field.label}
                    {field.required ? <span className="text-danger"> *</span> : null}
                  </>
                }
                className={field.wide ? 'connect-form__field--wide' : ''}
                {...(isSecret ? {} : { type: field.type })}
                value={values[field.key] || ''}
                onChange={(event) => handleFieldChange(field.key, event.target.value)}
                placeholder={isSecret && isConnectedToThis ? t('settings.storage.secretPlaceholderConnected') : field.placeholder}
                autoComplete="off"
                spellCheck={false}
                hint={hint}
              />
            );
          })}
        </div>

        {testState.status === TEST.OK || testState.status === TEST.FAILED ? (
          <div className={`callout-banner callout-banner--${testState.status === TEST.OK ? 'success' : 'danger'}`} role="status">
            <Icon name={testState.status === TEST.OK ? 'CheckCircle2' : 'AlertCircle'} size={16} />
            <span>{testState.message}</span>
          </div>
        ) : null}

        <div className="connect-form__actions">
          <button type="button" className="btn btn-outline-secondary-custom" onClick={() => runTest('connection')} disabled={isRunning || isSavingProvider}>
            {isRunning && testState.kind === 'connection' ? t('settings.storage.testingEllipsis') : t('settings.storage.testConnection')}
          </button>
          <button type="button" className="btn btn-outline-secondary-custom" onClick={() => runTest('upload')} disabled={isRunning || isSavingProvider}>
            {isRunning && testState.kind === 'upload' ? t('settings.storage.uploadingEllipsis') : t('settings.storage.testUpload')}
          </button>
          <button type="submit" className="btn btn-primary" disabled={isSavingProvider}>
            {isSavingProvider ? t('common.saving') : t('common.saveChanges')}
          </button>
        </div>
      </form>

      {/* ------------------------------------------------- Upload preferences */}
      <form className="surface-card" onSubmit={handleSavePreferences}>
        <h3 className="h5 mb-1">{t('settings.storage.imageStorageTitle')}</h3>
        <p className="text-secondary-custom mb-4">{t('settings.storage.imageStorageSubtitle')}</p>

        <div className="storage-toggle-row">
          <div>
            <div className="storage-toggle-row__title">{t('settings.storage.serverStorageTitle')}</div>
            <div className="storage-toggle-row__desc">{t('settings.storage.serverStorageDesc')}</div>
          </div>
          <div className="form-check form-switch mb-0">
            <input
              type="checkbox"
              className="form-check-input"
              role="switch"
              aria-label={t('settings.storage.serverStorageTitle')}
              checked={preferences.serverEnabled}
              onChange={(event) => setPreference('serverEnabled', event.target.checked)}
            />
          </div>
        </div>

        <div className="storage-toggle-row">
          <div>
            <div className="storage-toggle-row__title">{t('settings.storage.externalStorageTitle')}</div>
            <div className="storage-toggle-row__desc">
              {connected
                ? t('settings.storage.externalStorageDescConnected', { label: getStorageProvider(connected.providerKey)?.label })
                : t('settings.storage.externalStorageDescDisconnected')}
            </div>
          </div>
          <div className="form-check form-switch mb-0">
            <input
              type="checkbox"
              className="form-check-input"
              role="switch"
              aria-label={t('settings.storage.externalStorageTitle')}
              checked={preferences.externalEnabled}
              disabled={!connected}
              onChange={(event) => setPreference('externalEnabled', event.target.checked)}
            />
          </div>
        </div>

        <div className={`callout-banner callout-banner--${bothOff ? 'warning' : 'info'} mt-4`}>
          <Icon name={bothOff ? 'AlertTriangle' : 'Info'} size={16} />
          <span>
            {bothOff ? t('settings.storage.bothOffWarning') : t('settings.storage.oneOffInfo')}
          </span>
        </div>

        <label htmlFor="storageLimitValue" className="form-label-custom">
          {t('settings.storage.limitLabel')}
        </label>
        <div className="storage-limit-row">
          <input
            id="storageLimitValue"
            type="number"
            min="0"
            className="form-control"
            placeholder={t('settings.storage.limitPlaceholder')}
            value={preferences.limitValue}
            onChange={(event) => setPreference('limitValue', event.target.value)}
          />
          <select
            className="form-select"
            aria-label={t('settings.storage.limitLabel')}
            value={preferences.limitUnit}
            onChange={(event) => setPreference('limitUnit', event.target.value)}
          >
            {STORAGE_LIMIT_UNITS.map((unit) => (
              <option key={unit} value={unit}>
                {unit}
              </option>
            ))}
          </select>
        </div>
        <div className="form-hint mb-4">
          {t('settings.storage.limitHint')}
        </div>

        <div className="d-flex gap-2">
          <button type="submit" className="btn btn-primary" disabled={!isPreferencesDirty || isSavingPreferences}>
            {isSavingPreferences ? t('common.saving') : t('common.saveChanges')}
          </button>
          <button type="button" className="btn btn-outline-secondary-custom" onClick={() => setPreferences(saved.preferences)} disabled={!isPreferencesDirty}>
            {t('common.cancel')}
          </button>
        </div>
      </form>

      <ConfirmDialog
        isOpen={isDisconnectOpen}
        onClose={() => setIsDisconnectOpen(false)}
        onConfirm={handleDisconnectConfirmed}
        title={t('settings.storage.disconnectConfirmTitle')}
        message={t('settings.storage.disconnectConfirmMessage')}
        confirmLabel={t('socialAccounts.disconnect')}
        isDanger
      />
    </div>
  );
}

export default StorageSettings;
