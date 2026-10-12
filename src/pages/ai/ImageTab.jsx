import { useState } from 'react';
import Icon from '../../components/common/Icon';
import CalloutBanner from '../../components/common/CalloutBanner';
import SaveDraftPanel from '../../components/ai/SaveDraftPanel';
import { apiErrorMessage } from '../../services/api/axiosClient';
import { createImage } from '../../services/api/aiApi';
import { ASPECTS, DESIGN_TEMPLATES } from './aiOptions';
import EngineNote from '../../components/ai/EngineNote';
import { useI18n } from '../../i18n/useI18n';

/** An icon that gives a quick visual hint of each "Design" template — ai.image.templates.<key> has the label. */
const TEMPLATE_ICONS = { auto: 'Sparkles', bold: 'Megaphone', photo: 'Image', quote: 'Quote', promo: 'BadgePercent', none: 'ImageOff' };

/** Make a post visual with AI. It is saved to the Media Library (folder "AI Studio") automatically. */
function ImageTab({ onUsed }) {
  const { t } = useI18n();
  const [form, setForm] = useState({ prompt: '', aspect: 'square', textOnImage: '', template: 'auto' });
  const [media, setMedia] = useState(null);
  const [engine, setEngine] = useState({ engine: null, notice: null });
  const [error, setError] = useState('');
  const [isWorking, setIsWorking] = useState(false);
  const update = (field, value) => setForm((current) => ({ ...current, [field]: value }));

  function handleSubmit(event) {
    event.preventDefault();
    if (form.prompt.trim().length < 5) return setError(t('ai.image.promptRequired'));
    setError('');
    setIsWorking(true);
    createImage({ ...form, prompt: form.prompt.trim() })
      .then((data) => {
        setMedia(data.media);
        setEngine({ engine: data.engine, notice: data.notice });
        onUsed();
      })
      .catch((requestError) => setError(apiErrorMessage(requestError)))
      .finally(() => setIsWorking(false));
  }

  return (
    <div className="ai-tab">
      <form className="surface-card" onSubmit={handleSubmit}>
        {error ? (
          <CalloutBanner icon="AlertCircle" tone="danger">
            {error}
          </CalloutBanner>
        ) : null}
        <label className="form-label" htmlFor="ai-image-prompt">
          {t('ai.image.promptLabel')}
        </label>
        <textarea
          id="ai-image-prompt"
          className="form-control mb-3"
          rows={3}
          value={form.prompt}
          onChange={(event) => update('prompt', event.target.value)}
          placeholder={t('ai.image.promptPlaceholder')}
          maxLength={2000}
        />
        <label className="form-label">{t('ai.image.templateLabel')}</label>
        <div className="ai-template-picker mb-3" role="radiogroup" aria-label={t('ai.image.templateLabel')}>
          {DESIGN_TEMPLATES.map((template) => (
            <button
              key={template}
              type="button"
              role="radio"
              aria-checked={form.template === template}
              className={`ai-template-picker__option ${form.template === template ? 'is-active' : ''}`.trim()}
              onClick={() => update('template', template)}
            >
              <Icon name={TEMPLATE_ICONS[template]} size={18} />
              <span>{t(`ai.image.templates.${template}`)}</span>
            </button>
          ))}
        </div>
        <p className="form-hint mb-3">{t(`ai.image.templateHints.${form.template}`)}</p>

        <div className="row g-3">
          <div className="col-sm-6">
            <label className="form-label" htmlFor="ai-image-aspect">
              {t('ai.shape')}
            </label>
            <select id="ai-image-aspect" className="form-select" value={form.aspect} onChange={(event) => update('aspect', event.target.value)}>
              {ASPECTS.map((aspect) => (
                <option key={aspect} value={aspect}>
                  {t(`ai.aspects.${aspect}`)}
                </option>
              ))}
            </select>
          </div>
          <div className="col-sm-6">
            <label className="form-label" htmlFor="ai-image-text">
              {t('ai.image.textOnImage')}
            </label>
            <input
              id="ai-image-text"
              className="form-control"
              value={form.textOnImage}
              onChange={(event) => update('textOnImage', event.target.value)}
              placeholder={t('ai.image.textOnImagePlaceholder')}
              maxLength={120}
            />
          </div>
        </div>
        <div className="d-flex justify-content-between align-items-center mt-3 gap-3 flex-wrap">
          <span className="form-hint">{t('ai.image.takes')}</span>
          <button type="submit" className="btn btn-primary d-inline-flex align-items-center gap-2" disabled={isWorking}>
            <Icon name="Wand2" size={16} /> {isWorking ? t('ai.creating') : t('ai.image.submit')}
          </button>
        </div>
      </form>

      {media ? (
        <section className="surface-card ai-media-result">
          <img src={media.publicUrl} alt={form.prompt} className="ai-media-result__preview" />
          <div className="flex-grow-1">
            <EngineNote engine={engine.engine} notice={engine.notice} />
            <p className="form-hint">{t('ai.image.savedToLibrary')}</p>
            <SaveDraftPanel key={media.id} mediaIds={[media.id]} idPrefix="image-draft" />
          </div>
        </section>
      ) : null}
    </div>
  );
}

export default ImageTab;
