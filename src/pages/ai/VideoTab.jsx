import { useState } from 'react';
import { Link } from 'react-router-dom';
import Icon from '../../components/common/Icon';
import CalloutBanner from '../../components/common/CalloutBanner';
import SaveDraftPanel from '../../components/ai/SaveDraftPanel';
import useGenerationPoller from '../../components/ai/useGenerationPoller';
import { apiErrorMessage } from '../../services/api/axiosClient';
import { createSlideshow, createVideo } from '../../services/api/aiApi';
import { AI_LANGUAGES, ASPECTS, TONES } from './aiOptions';
import { useI18n } from '../../i18n/useI18n';

/** Progress / result of a background video job. */
function VideoJob({ started }) {
  const { t } = useI18n();
  const generation = useGenerationPoller(started);
  if (!generation) return null;
  if (generation.status === 'failed') {
    return (
      <CalloutBanner icon="AlertCircle" tone="danger">
        {t('ai.video.failed', { error: generation.error })}
      </CalloutBanner>
    );
  }
  if (generation.status !== 'succeeded') {
    return (
      <section className="surface-card d-flex align-items-center gap-3">
        <span className="spinner-border spinner-border-sm text-primary" role="status" aria-hidden="true" />
        <span>
          {generation.kind === 'video' ? t('ai.video.workingAi') : t('ai.video.workingSlideshow')} {t('ai.video.canLeave')}
        </span>
      </section>
    );
  }
  return (
    <section className="surface-card ai-media-result">
      <video src={generation.mediaUrl} controls className="ai-media-result__preview" />
      <div className="flex-grow-1">
        <p className="form-hint">
          {t('ai.image.savedToLibrary')} <Link to="/media">{t('ai.video.openLibrary')}</Link>
        </p>
        <SaveDraftPanel key={generation.id} initialContent={generation.result?.postText ?? ''} mediaIds={[generation.mediaId]} idPrefix="video-draft" />
      </div>
    </section>
  );
}

/**
 * Two ways to make a video:
 *  - Slideshow (free): AI writes captions and makes pictures; the server turns them into an MP4.
 *  - AI video (paid plans): a real text-to-video model (OpenAI Sora / Google Veo).
 */
function VideoTab({ access, onUsed }) {
  const { t } = useI18n();
  const [mode, setMode] = useState('slideshow');
  const [form, setForm] = useState({ brief: '', slideCount: 4, aspect: 'portrait', language: 'en', tone: 'friendly', seconds: 8 });
  const [job, setJob] = useState(null);
  const [error, setError] = useState('');
  const [isStarting, setIsStarting] = useState(false);
  const update = (field, value) => setForm((current) => ({ ...current, [field]: value }));

  function handleSubmit(event) {
    event.preventDefault();
    if (form.brief.trim().length < 5) return setError(t('ai.video.briefRequired'));
    setError('');
    setIsStarting(true);
    const request =
      mode === 'slideshow'
        ? createSlideshow({ brief: form.brief.trim(), slideCount: form.slideCount, aspect: form.aspect, language: form.language, tone: form.tone })
        : createVideo({ prompt: form.brief.trim(), aspect: form.aspect, seconds: form.seconds });
    request
      .then((generation) => {
        setJob(generation);
        onUsed();
      })
      .catch((requestError) => setError(apiErrorMessage(requestError)))
      .finally(() => setIsStarting(false));
  }

  return (
    <div className="ai-tab">
      <div className="segmented-control align-self-start" role="group" aria-label={t('ai.video.typeLabel')}>
        <button type="button" className={`segmented-control__item ${mode === 'slideshow' ? 'is-active' : ''}`.trim()} onClick={() => setMode('slideshow')}>
          {t('ai.video.slideshowFree')}
        </button>
        <button
          type="button"
          className={`segmented-control__item ${mode === 'ai' ? 'is-active' : ''}`.trim()}
          onClick={() => setMode('ai')}
          disabled={!access.videoAvailable}
          title={access.videoAvailable ? undefined : t('ai.video.notInPlan')}
        >
          {access.videoAvailable ? t('ai.video.aiVideo') : `🔒 ${t('ai.video.aiVideo')}`}
        </button>
      </div>

      <form className="surface-card" onSubmit={handleSubmit}>
        {error ? (
          <CalloutBanner icon="AlertCircle" tone="danger">
            {error}
          </CalloutBanner>
        ) : null}
        <label className="form-label" htmlFor="ai-video-brief">
          {mode === 'slideshow' ? t('ai.video.briefLabel') : t('ai.video.sceneLabel')}
        </label>
        <textarea
          id="ai-video-brief"
          className="form-control mb-3"
          rows={3}
          value={form.brief}
          onChange={(event) => update('brief', event.target.value)}
          placeholder={mode === 'slideshow' ? t('ai.video.briefPlaceholder') : t('ai.video.scenePlaceholder')}
          maxLength={2000}
        />
        <div className="row g-3">
          <div className="col-sm-6 col-lg-3">
            <label className="form-label" htmlFor="ai-video-aspect">
              {t('ai.shape')}
            </label>
            <select id="ai-video-aspect" className="form-select" value={form.aspect} onChange={(event) => update('aspect', event.target.value)}>
              {ASPECTS.map((aspect) => (
                <option key={aspect} value={aspect}>
                  {t(`ai.aspects.${aspect}`)}
                </option>
              ))}
            </select>
          </div>
          {mode === 'slideshow' ? (
            <>
              <div className="col-sm-6 col-lg-3">
                <label className="form-label" htmlFor="ai-video-slides">
                  {t('ai.video.slides')}
                </label>
                <select id="ai-video-slides" className="form-select" value={form.slideCount} onChange={(event) => update('slideCount', Number(event.target.value))}>
                  {[2, 3, 4, 5, 6, 7, 8].map((count) => (
                    <option key={count} value={count}>
                      {t('ai.video.slideCount', { count, seconds: count * 3 })}
                    </option>
                  ))}
                </select>
              </div>
              <div className="col-sm-6 col-lg-3">
                <label className="form-label" htmlFor="ai-video-language">
                  {t('ai.video.captionLanguage')}
                </label>
                <select id="ai-video-language" className="form-select" value={form.language} onChange={(event) => update('language', event.target.value)}>
                  {AI_LANGUAGES.map((language) => (
                    <option key={language.code} value={language.code}>
                      {language.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="col-sm-6 col-lg-3">
                <label className="form-label" htmlFor="ai-video-tone">
                  {t('ai.tone')}
                </label>
                <select id="ai-video-tone" className="form-select" value={form.tone} onChange={(event) => update('tone', event.target.value)}>
                  {TONES.map((tone) => (
                    <option key={tone} value={tone}>
                      {t(`ai.tones.${tone}`)}
                    </option>
                  ))}
                </select>
              </div>
            </>
          ) : (
            <div className="col-sm-6 col-lg-3">
              <label className="form-label" htmlFor="ai-video-seconds">
                {t('ai.video.length')}
              </label>
              <select id="ai-video-seconds" className="form-select" value={form.seconds} onChange={(event) => update('seconds', Number(event.target.value))}>
                {[4, 8, 12].map((seconds) => (
                  <option key={seconds} value={seconds}>
                    {t('ai.video.seconds', { seconds })}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>
        <div className="d-flex justify-content-between align-items-center mt-3 gap-3 flex-wrap">
          <span className="form-hint">
            {mode === 'slideshow' ? t('ai.video.costSlideshow', { credits: access.credits.costs.slideshow }) : t('ai.video.costAi', { credits: access.credits.costs.video })}{' '}
            {t('ai.video.ownKeyFree')}
          </span>
          <button type="submit" className="btn btn-primary d-inline-flex align-items-center gap-2" disabled={isStarting}>
            <Icon name="Clapperboard" size={16} /> {isStarting ? t('ai.video.starting') : t('ai.video.submit')}
          </button>
        </div>
      </form>

      <VideoJob started={job} />
    </div>
  );
}

export default VideoTab;
