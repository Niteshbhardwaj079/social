import { useEffect, useState } from 'react';
import Modal from '../common/Modal';
import Icon from '../common/Icon';
import UtmBuilderModal from '../common/UtmBuilderModal';
import TextField from '../forms/TextField';
import { AD_CTAS } from '../../config/adPlatforms';
import { useI18n } from '../../i18n/useI18n';

const EMPTY_FORM = { name: '', headline: '', text: '', cta: 'Learn more', destinationUrl: '', mediaId: '' };

// Pass `template` to edit an existing one instead of creating a new one — the form prefills from it.
function TemplateFormModal({ isOpen, onClose, onSubmit, template, images }) {
  const { t } = useI18n();
  const isEditing = Boolean(template);
  const [form, setForm] = useState(EMPTY_FORM);
  const [isUtmBuilderOpen, setIsUtmBuilderOpen] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    setForm(
      template
        ? { name: template.name, headline: template.headline, text: template.text, cta: template.cta, destinationUrl: template.destinationUrl, mediaId: template.mediaId || '' }
        : EMPTY_FORM
    );
  }, [isOpen, template]);

  const update = (patch) => setForm((current) => ({ ...current, ...patch }));

  function handleSubmit(event) {
    event.preventDefault();
    onSubmit({ ...form, mediaId: form.mediaId || null });
  }

  const footer = (
    <>
      <button type="button" className="btn btn-outline-secondary-custom" onClick={onClose}>
        {t('common.cancel')}
      </button>
      <button type="submit" form="template-form" className="btn btn-primary">
        {isEditing ? t('common.saveChanges') : t('ads.saveTemplateButton')}
      </button>
    </>
  );

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={isEditing ? t('ads.editTemplateTitle') : t('ads.newTemplateTitle')} footer={footer} size="lg">
      <form id="template-form" onSubmit={handleSubmit}>
        <TextField id="templateName" label={t('ads.templateNameLabel')} value={form.name} onChange={(event) => update({ name: event.target.value })} placeholder={t('ads.templateNamePlaceholder')} required />
        <div className="mb-4">
          <label htmlFor="templateText" className="form-label-custom">{t('ads.adTextLabel')}</label>
          <textarea id="templateText" className="form-control" rows={4} maxLength={500} value={form.text} onChange={(event) => update({ text: event.target.value })} placeholder={t('ads.adTextPlaceholder')} />
        </div>
        <div className="form-grid-2">
          <TextField id="templateHeadline" label={t('ads.headlineLabel')} value={form.headline} onChange={(event) => update({ headline: event.target.value })} maxLength={80} placeholder={t('ads.headlinePlaceholder')} />
          <div className="mb-4">
            <label htmlFor="templateCta" className="form-label-custom">{t('ads.buttonLabel')}</label>
            <select id="templateCta" className="form-select" value={form.cta} onChange={(event) => update({ cta: event.target.value })}>
              {AD_CTAS.map((cta) => <option key={cta} value={cta}>{cta}</option>)}
            </select>
          </div>
        </div>
        <TextField id="templateUrl" label={t('ads.destinationUrlLabel')} type="url" value={form.destinationUrl} onChange={(event) => update({ destinationUrl: event.target.value })} placeholder="https://yoursite.com/offer" />
        <button type="button" className="btn btn-link p-0 mb-4" onClick={() => setIsUtmBuilderOpen(true)}>
          {t('ads.addUtmButton')}
        </button>
        <UtmBuilderModal
          isOpen={isUtmBuilderOpen}
          onClose={() => setIsUtmBuilderOpen(false)}
          initialUrl={form.destinationUrl}
          onApply={(taggedUrl) => {
            update({ destinationUrl: taggedUrl });
            setIsUtmBuilderOpen(false);
          }}
        />
        <div className="mb-0">
          <span className="form-label-custom d-block">{t('ads.imageLabel')}</span>
          <div className="ad-image-grid">
            <button type="button" className={`ad-image-option ${form.mediaId === '' ? 'is-selected' : ''}`.trim()} onClick={() => update({ mediaId: '' })}>
              <Icon name="ImageOff" size={20} /> {t('ads.noneOption')}
            </button>
            {images.slice(0, 8).map((image) => (
              <button key={image.id} type="button" className={`ad-image-option ${form.mediaId === image.id ? 'is-selected' : ''}`.trim()} onClick={() => update({ mediaId: image.id })} title={image.name}>
                {image.url ? <img src={image.url} alt={image.name} /> : <Icon name="Image" size={20} />}
                <span className="ad-image-option__name">{image.name}</span>
              </button>
            ))}
          </div>
        </div>
      </form>
    </Modal>
  );
}

export default TemplateFormModal;
