import { useEffect, useState } from 'react';
import CalloutBanner from '../../components/common/CalloutBanner';
import ErrorState from '../../components/common/ErrorState';
import PageLoader from '../../components/common/PageLoader';
import { useToast } from '../../components/common/ToastProvider';
import { apiErrorMessage } from '../../services/api/axiosClient';
import * as aiApi from '../../services/api/aiApi';
import { savePlatformSettings } from '../../services/api/platformApi';
import { useI18n } from '../../i18n/useI18n';

/** One of the platform's own AI keys: these power AI for every organization without its own key. */
function PlatformKeyRow({ provider, connected, onChanged }) {
  const { t } = useI18n();
  const { showToast } = useToast();
  const [apiKey, setApiKey] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  function save(event) {
    event.preventDefault();
    setIsSaving(true);
    aiApi
      .savePlatformAiKey(provider.key, apiKey.trim())
      .then((keys) => {
        setApiKey('');
        showToast({ type: 'success', title: t('platform.ai.keySaved', { provider: provider.label }), message: t('platform.ai.keyChecked') });
        onChanged(keys);
      })
      .catch((error) => showToast({ type: 'error', title: apiErrorMessage(error) }))
      .finally(() => setIsSaving(false));
  }

  function remove() {
    aiApi
      .removePlatformAiKey(provider.key)
      .then(onChanged)
      .catch((error) => showToast({ type: 'error', title: apiErrorMessage(error) }));
  }

  return (
    <form className="platform-ai-key" onSubmit={save}>
      <div className="platform-ai-key__name">
        <strong>{provider.label}</strong>
        <div className="form-hint">{connected ? t('ai.keys.connected', { hint: connected.hint }) : t('ai.keys.noKey')}</div>
      </div>
      <input
        type="password"
        className="form-control"
        placeholder={connected ? t('ai.keys.replacePlaceholder') : t('ai.keys.pastePlaceholder')}
        value={apiKey}
        onChange={(event) => setApiKey(event.target.value)}
        autoComplete="off"
        aria-label={t('ai.keys.keyLabel', { provider: provider.label })}
      />
      <button type="submit" className="btn btn-primary" disabled={isSaving || apiKey.trim().length < 10}>
        {isSaving ? t('ai.keys.checking') : t('ai.save')}
      </button>
      {connected ? (
        <button type="button" className="btn btn-outline-danger" onClick={remove}>
          {t('common.remove')}
        </button>
      ) : null}
    </form>
  );
}

/**
 * Platform → AI: switch AI on/off (or hide it) for everyone, the platform's own keys, and which model
 * each provider uses. Per-organization switches are under Organizations → Manage.
 */
function PlatformAi() {
  const { t } = useI18n();
  const { showToast } = useToast();
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    aiApi
      .getPlatformAi()
      .then(setData)
      .catch((loadError) => setError(apiErrorMessage(loadError)));
  }, []);

  const updateSetting = (field, value) => setData((current) => ({ ...current, settings: { ...current.settings, [field]: value } }));
  const updateModel = (provider, kind, value) =>
    setData((current) => ({
      ...current,
      settings: { ...current.settings, aiModels: { ...current.settings.aiModels, [provider]: { ...current.settings.aiModels[provider], [kind]: value } } },
    }));

  function saveSettings(event) {
    event.preventDefault();
    setIsSaving(true);
    savePlatformSettings(data.settings)
      .then(() => showToast({ type: 'success', title: t('platform.ai.saved') }))
      .catch((saveError) => showToast({ type: 'error', title: apiErrorMessage(saveError) }))
      .finally(() => setIsSaving(false));
  }

  if (error) return <ErrorState description={error} />;
  if (!data) return <PageLoader minHeight="16rem" />;

  return (
    <div className="d-flex flex-column gap-4">
      <form className="surface-card" onSubmit={saveSettings}>
        <h3 className="h5 mb-3">{t('platform.ai.everyoneTitle')}</h3>
        <div className="form-check form-switch">
          <input id="ai-enabled" type="checkbox" role="switch" className="form-check-input" checked={data.settings.aiEnabled} onChange={(event) => updateSetting('aiEnabled', event.target.checked)} />
          <label className="form-check-label" htmlFor="ai-enabled">
            {t('platform.ai.enabled')}
          </label>
        </div>
        <div className="form-check form-switch mb-3">
          <input
            id="ai-hidden"
            type="checkbox"
            role="switch"
            className="form-check-input"
            checked={data.settings.aiHiddenWhenDisabled}
            onChange={(event) => updateSetting('aiHiddenWhenDisabled', event.target.checked)}
          />
          <label className="form-check-label" htmlFor="ai-hidden">
            {t('platform.ai.hidden')}
          </label>
        </div>

        <h3 className="h6 mt-4 mb-2">{t('platform.ai.ollamaTitle')}</h3>
        <p className="form-hint">{t('platform.ai.ollamaHint')}</p>
        <input
          className="form-control mb-3"
          placeholder="http://localhost:11434"
          value={data.settings.aiOllamaUrl ?? ''}
          onChange={(event) => updateSetting('aiOllamaUrl', event.target.value.trim())}
          aria-label={t('platform.ai.ollamaAddress')}
        />

        <h3 className="h6 mt-4 mb-2">{t('platform.ai.modelsTitle')}</h3>
        <p className="form-hint">{t('platform.ai.modelsHint')}</p>
        <div className="row g-3">
          {data.providers.map((provider) =>
            Object.keys(provider.defaultModels).map((kind) => (
              <div key={`${provider.key}-${kind}`} className="col-sm-6 col-lg-4">
                <label className="form-label" htmlFor={`model-${provider.key}-${kind}`}>
                  {provider.label} — {t(`platform.ai.kind.${kind}`)}
                </label>
                <input
                  id={`model-${provider.key}-${kind}`}
                  className="form-control"
                  value={data.settings.aiModels[provider.key]?.[kind] ?? ''}
                  onChange={(event) => updateModel(provider.key, kind, event.target.value)}
                  placeholder={provider.defaultModels[kind]}
                  maxLength={100}
                />
              </div>
            ))
          )}
        </div>
        <div className="d-flex justify-content-end mt-3">
          <button type="submit" className="btn btn-primary" disabled={isSaving}>
            {isSaving ? t('billing.saving') : t('ai.save')}
          </button>
        </div>
      </form>

      <section className="surface-card">
        <h3 className="h5 mb-1">{t('platform.ai.keysTitle')}</h3>
        <CalloutBanner icon="Info">{t('platform.ai.keysHint')}</CalloutBanner>
        <div className="d-flex flex-column gap-3 mt-3">
          {data.providers
            .filter((provider) => provider.key !== 'ollama') // set by address above, not by key
            .map((provider) => (
            <PlatformKeyRow
              key={provider.key}
              provider={provider}
              connected={data.keys.find((key) => key.provider === provider.key)}
              onChanged={(keys) => setData((current) => ({ ...current, keys }))}
            />
          ))}
        </div>
      </section>
    </div>
  );
}

export default PlatformAi;
