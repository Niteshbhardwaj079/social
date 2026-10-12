import { useEffect, useState } from 'react';
import { useSelector } from 'react-redux';
import CalloutBanner from '../../components/common/CalloutBanner';
import EmptyState from '../../components/common/EmptyState';
import ErrorState from '../../components/common/ErrorState';
import PageLoader from '../../components/common/PageLoader';
import { useToast } from '../../components/common/ToastProvider';
import { API_ENABLED } from '../../config/runtime';
import { apiErrorMessage } from '../../services/api/axiosClient';
import * as aiApi from '../../services/api/aiApi';
import { useI18n } from '../../i18n/useI18n';

// Which provider does which job; the label of each is ai.settings.kind.<key>.
const KINDS = [
  { key: 'text', field: 'textProvider' },
  { key: 'image', field: 'imageProvider' },
  { key: 'video', field: 'videoProvider' },
];

/** One provider: what it can do, and connecting / removing the organization's own key. */
function ProviderCard({ provider, canEdit, onKeysChanged }) {
  const { t } = useI18n();
  const { showToast } = useToast();
  const [apiKey, setApiKey] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const can = Object.entries(provider.capabilities)
    .filter(([, yes]) => yes)
    .map(([kind]) => t(`platform.ai.kind.${kind}`))
    .join(', ');

  function save(event) {
    event.preventDefault();
    setIsSaving(true);
    aiApi
      .saveAiKey(provider.key, apiKey.trim())
      .then(() => {
        setApiKey('');
        showToast({ type: 'success', title: t('ai.keys.connectedTitle', { provider: provider.label }), message: t('platform.ai.keyChecked') });
        onKeysChanged();
      })
      .catch((error) => showToast({ type: 'error', title: apiErrorMessage(error) }))
      .finally(() => setIsSaving(false));
  }

  function remove() {
    aiApi
      .removeAiKey(provider.key)
      .then(onKeysChanged)
      .catch((error) => showToast({ type: 'error', title: apiErrorMessage(error) }));
  }

  return (
    <section className="surface-card">
      <div className="d-flex justify-content-between align-items-start gap-3 flex-wrap">
        <div>
          <h3 className="h6 mb-1">{provider.label}</h3>
          <div className="form-hint">{t('ai.keys.canMake', { kinds: can })}</div>
        </div>
        {provider.ownKey ? (
          <span className="status-badge status-badge--connected">{t('ai.keys.yourKey', { hint: provider.ownKey.hint })}</span>
        ) : provider.platformKeyAvailable ? (
          <span className="status-badge status-badge--pending">{t('ai.keys.usingPlatformKey')}</span>
        ) : (
          <span className="status-badge status-badge--disconnected">{t('ai.keys.notConnected')}</span>
        )}
      </div>
      {canEdit ? (
        <form className="d-flex gap-2 mt-3 flex-wrap" onSubmit={save}>
          <input
            type="password"
            className="form-control flex-grow-1"
            placeholder={provider.ownKey ? t('ai.keys.replacePlaceholder') : t('ai.keys.pastePlaceholder')}
            value={apiKey}
            onChange={(event) => setApiKey(event.target.value)}
            autoComplete="off"
            aria-label={t('ai.keys.keyLabel', { provider: provider.label })}
          />
          <button type="submit" className="btn btn-primary" disabled={isSaving || apiKey.trim().length < 10}>
            {isSaving ? t('ai.keys.checking') : t('ai.keys.saveKey')}
          </button>
          {provider.ownKey ? (
            <button type="button" className="btn btn-outline-danger" onClick={remove}>
              {t('common.remove')}
            </button>
          ) : null}
        </form>
      ) : null}
    </section>
  );
}

/**
 * Settings → AI: the organization's own AI keys (no credit limits — they pay the provider directly),
 * which provider does which job, and the brand voice the AI writes in.
 */
function AiSettings() {
  const { t } = useI18n();
  const { showToast } = useToast();
  const canEdit = useSelector((state) => state.auth.currentUser?.permissions?.settingsEdit === true);
  const [data, setData] = useState(null);
  const [choices, setChoices] = useState(null);
  const [error, setError] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  function load() {
    aiApi
      .getAiSettings()
      .then((value) => {
        setData(value);
        setChoices(value.settings);
      })
      .catch((loadError) => setError(apiErrorMessage(loadError)));
  }
  useEffect(() => {
    if (API_ENABLED) load();
  }, []);

  function saveChoices(event) {
    event.preventDefault();
    setIsSaving(true);
    aiApi
      .saveAiSettings(choices)
      .then((saved) => {
        setChoices(saved);
        showToast({ type: 'success', title: t('platform.ai.saved') });
      })
      .catch((saveError) => showToast({ type: 'error', title: apiErrorMessage(saveError) }))
      .finally(() => setIsSaving(false));
  }

  if (!API_ENABLED) return <EmptyState icon="Sparkles" title={t('ai.needsServerTitle')} />;
  if (error) return <ErrorState description={error} />;
  if (!data) return <PageLoader minHeight="24rem" />;

  return (
    <div className="d-flex flex-column gap-4">
      <CalloutBanner icon="KeyRound">{t('ai.settings.intro')}</CalloutBanner>

      {data.providers.map((provider) => (
        <ProviderCard key={provider.key} provider={provider} canEdit={canEdit} onKeysChanged={load} />
      ))}

      <form className="surface-card" onSubmit={saveChoices}>
        <h3 className="h5 mb-3">{t('ai.settings.whichTitle')}</h3>
        <fieldset disabled={!canEdit} className="row g-3">
          {KINDS.map((kind) => (
            <div key={kind.key} className="col-sm-4">
              <label className="form-label" htmlFor={`ai-choice-${kind.key}`}>
                {t(`ai.settings.kind.${kind.key}`)}
              </label>
              <select
                id={`ai-choice-${kind.key}`}
                className="form-select"
                value={choices[kind.field] ?? ''}
                onChange={(event) => setChoices((current) => ({ ...current, [kind.field]: event.target.value || null }))}
              >
                <option value="">{t('ai.settings.automatic')}</option>
                {data.providers
                  .filter((provider) => provider.capabilities[kind.key])
                  .map((provider) => (
                    <option key={provider.key} value={provider.key}>
                      {provider.label}
                    </option>
                  ))}
              </select>
            </div>
          ))}
          <div className="col-12">
            <label className="form-label" htmlFor="ai-brand-voice">
              {t('ai.settings.brandVoice')}
            </label>
            <textarea
              id="ai-brand-voice"
              className="form-control"
              rows={2}
              value={choices.brandVoice}
              onChange={(event) => setChoices((current) => ({ ...current, brandVoice: event.target.value }))}
              placeholder={t('ai.settings.brandVoicePlaceholder')}
              maxLength={500}
            />
          </div>
        </fieldset>
        {canEdit ? (
          <div className="d-flex justify-content-end mt-3">
            <button type="submit" className="btn btn-primary" disabled={isSaving}>
              {isSaving ? t('billing.saving') : t('ai.save')}
            </button>
          </div>
        ) : null}
      </form>
    </div>
  );
}

export default AiSettings;
