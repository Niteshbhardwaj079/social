import { useState } from 'react';
import Icon from '../../components/common/Icon';
import CalloutBanner from '../../components/common/CalloutBanner';
import PlatformPicker from '../../components/ai/PlatformPicker';
import SaveDraftPanel from '../../components/ai/SaveDraftPanel';
import { useToast } from '../../components/common/ToastProvider';
import { apiErrorMessage } from '../../services/api/axiosClient';
import { writePosts } from '../../services/api/aiApi';
import { AI_LANGUAGES, TONES } from './aiOptions';
import EngineNote from '../../components/ai/EngineNote';
import { useI18n } from '../../i18n/useI18n';

/** Write a post with AI: a brief in, a few ready-to-post versions out. */
function WriteTab({ onUsed, initialBrief = '' }) {
  const { t } = useI18n();
  const { showToast } = useToast();
  const [form, setForm] = useState({ brief: initialBrief, platforms: ['facebook', 'instagram'], tone: 'friendly', language: 'en', variants: 3, hashtags: true });
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  const [isWorking, setIsWorking] = useState(false);
  const [chosen, setChosen] = useState(null); // index of the version being saved as a draft
  const update = (field, value) => setForm((current) => ({ ...current, [field]: value }));

  function handleSubmit(event) {
    event.preventDefault();
    if (form.brief.trim().length < 5) return setError(t('ai.write.briefRequired'));
    setError('');
    setIsWorking(true);
    setChosen(null);
    writePosts({ ...form, brief: form.brief.trim() })
      .then((data) => {
        setResult(data);
        onUsed();
      })
      .catch((requestError) => setError(apiErrorMessage(requestError)))
      .finally(() => setIsWorking(false));
  }

  function copy(text) {
    navigator.clipboard
      ?.writeText(text)
      .then(() => showToast({ type: 'success', title: t('ai.write.copied') }))
      .catch(() => showToast({ type: 'error', title: t('ai.write.copyFailed') }));
  }

  return (
    <div className="ai-tab">
      <form className="surface-card" onSubmit={handleSubmit}>
        {error ? (
          <CalloutBanner icon="AlertCircle" tone="danger">
            {error}
          </CalloutBanner>
        ) : null}
        <label className="form-label" htmlFor="ai-brief">
          {t('ai.write.briefLabel')}
        </label>
        <textarea
          id="ai-brief"
          className="form-control mb-3"
          rows={3}
          value={form.brief}
          onChange={(event) => update('brief', event.target.value)}
          placeholder={t('ai.write.briefPlaceholder')}
          maxLength={2000}
        />
        <div className="form-label">{t('ai.platforms')}</div>
        <PlatformPicker value={form.platforms} onChange={(value) => update('platforms', value)} idPrefix="write" />
        <div className="row g-3 mt-1">
          <div className="col-sm-4">
            <label className="form-label" htmlFor="ai-tone">
              {t('ai.tone')}
            </label>
            <select id="ai-tone" className="form-select" value={form.tone} onChange={(event) => update('tone', event.target.value)}>
              {TONES.map((tone) => (
                <option key={tone} value={tone}>
                  {t(`ai.tones.${tone}`)}
                </option>
              ))}
            </select>
          </div>
          <div className="col-sm-4">
            <label className="form-label" htmlFor="ai-language">
              {t('ai.language')}
            </label>
            <select id="ai-language" className="form-select" value={form.language} onChange={(event) => update('language', event.target.value)}>
              {AI_LANGUAGES.map((language) => (
                <option key={language.code} value={language.code}>
                  {language.name}
                </option>
              ))}
            </select>
          </div>
          <div className="col-sm-4">
            <label className="form-label" htmlFor="ai-variants">
              {t('ai.write.versions')}
            </label>
            <select id="ai-variants" className="form-select" value={form.variants} onChange={(event) => update('variants', Number(event.target.value))}>
              {[1, 2, 3, 4, 5].map((count) => (
                <option key={count} value={count}>
                  {count}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div className="d-flex justify-content-between align-items-center mt-3 flex-wrap gap-3">
          <div className="form-check form-switch mb-0">
            <input id="ai-hashtags" type="checkbox" role="switch" className="form-check-input" checked={form.hashtags} onChange={(event) => update('hashtags', event.target.checked)} />
            <label className="form-check-label" htmlFor="ai-hashtags">
              {t('ai.write.hashtags')}
            </label>
          </div>
          <button type="submit" className="btn btn-primary d-inline-flex align-items-center gap-2" disabled={isWorking}>
            <Icon name="Sparkles" size={16} /> {isWorking ? t('ai.write.writing') : t('ai.write.submit')}
          </button>
        </div>
      </form>

      {result ? (
        <div className="ai-results">
          <EngineNote engine={result.engine} notice={result.notice} />
          {result.variants.map((text, index) => {
            const tooLong = text.length > result.maxChars;
            return (
              <section key={`${result.generationId}-${index}`} className="surface-card ai-variant">
                <p className="ai-variant__text">{text}</p>
                <div className="d-flex justify-content-between align-items-center flex-wrap gap-2">
                  <span className={`small ${tooLong ? 'text-danger' : 'text-secondary-custom'}`}>
                    {t('ai.write.characters', { count: text.length, max: result.maxChars })}
                    {tooLong ? ` — ${t('ai.write.tooLong')}` : ''}
                  </span>
                  <div className="d-flex gap-2">
                    <button type="button" className="btn btn-sm btn-outline-secondary-custom" onClick={() => copy(text)}>
                      <Icon name="Copy" size={14} /> {t('ai.write.copy')}
                    </button>
                    <button type="button" className="btn btn-sm btn-primary" onClick={() => setChosen(index)}>
                      {t('ai.write.useThis')}
                    </button>
                  </div>
                </div>
                {chosen === index ? (
                  <div className="mt-3">
                    <SaveDraftPanel key={`${result.generationId}-${index}`} initialContent={text} initialPlatforms={form.platforms} idPrefix={`write-${index}`} />
                  </div>
                ) : null}
              </section>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}

export default WriteTab;
