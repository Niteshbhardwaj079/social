import { useEffect, useRef, useState } from 'react';
import Icon from '../common/Icon';
import CalloutBanner from '../common/CalloutBanner';
import PageLoader from '../common/PageLoader';
import { useToast } from '../common/ToastProvider';
import { apiErrorMessage } from '../../services/api/axiosClient';
import { brandKitFromWebsite, getBrandKit, saveBrandKit } from '../../services/api/aiApi';
import { uploadMediaItem } from '../../services/api/mediaApi';
import { useI18n } from '../../i18n/useI18n';

const LOGO_MAX_BYTES = 5 * 1024 * 1024;

/**
 * The form fields, in order. `rows` = a multi-line box.
 * Texts: ai.brandKit.fields.<key> (label) and ai.brandKit.placeholders.<key>.
 */
const FIELDS = [
  { key: 'companyName' },
  { key: 'industry' },
  { key: 'location' },
  { key: 'targetAudience' },
  { key: 'description', rows: 2, wide: true },
  { key: 'products', rows: 3 },
  { key: 'usps', rows: 3 },
  { key: 'competitors', rows: 2 },
  { key: 'keywords', rows: 2 },
  { key: 'tone' },
  { key: 'avoid' },
  { key: 'phone' },
];

/**
 * The Brand Kit: everything the marketing agent knows about the business. "Fill from my website"
 * reads the site (free) and suggests the fields; nothing is saved until "Save Brand Kit".
 */
function BrandKitForm({ onSaved }) {
  const { t } = useI18n();
  const { showToast } = useToast();
  const [values, setValues] = useState(null);
  const [error, setError] = useState('');
  const [isReading, setIsReading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isUploadingLogo, setIsUploadingLogo] = useState(false);
  const logoInputRef = useRef(null);

  useEffect(() => {
    getBrandKit()
      .then(setValues)
      .catch((loadError) => setError(apiErrorMessage(loadError)));
  }, []);

  const update = (field, value) => setValues((current) => ({ ...current, [field]: value }));

  function fillFromWebsite() {
    if (!values.website.trim()) return showToast({ type: 'error', title: t('ai.brandKit.websiteRequired') });
    setIsReading(true);
    brandKitFromWebsite(values.website.trim())
      .then(({ suggestion }) => {
        // Only fill what is still empty — never overwrite what the person already wrote.
        setValues((current) => {
          const next = { ...current };
          Object.entries(suggestion).forEach(([key, value]) => {
            if (value && !String(current[key] ?? '').trim()) next[key] = value;
          });
          return next;
        });
        showToast({ type: 'success', title: t('ai.brandKit.filledTitle'), message: t('ai.brandKit.filledText') });
      })
      .catch((readError) => showToast({ type: 'error', title: apiErrorMessage(readError) }))
      .finally(() => setIsReading(false));
  }

  function handleLogoChosen(event) {
    const file = event.target.files?.[0];
    event.target.value = ''; // lets the same file be chosen again later
    if (!file) return;
    if (!file.type.startsWith('image/')) return showToast({ type: 'error', title: t('ai.brandKit.logoNeedsImage') });
    if (file.size > LOGO_MAX_BYTES) return showToast({ type: 'error', title: t('ai.brandKit.logoTooBig') });
    setIsUploadingLogo(true);
    uploadMediaItem({ name: file.name, folder: 'Brand Kit' }, file)
      .then((item) => setValues((current) => ({ ...current, logoMediaId: item.id, logoUrl: item.publicUrl })))
      .catch((uploadError) => showToast({ type: 'error', title: apiErrorMessage(uploadError) }))
      .finally(() => setIsUploadingLogo(false));
  }

  function removeLogo() {
    setValues((current) => ({ ...current, logoMediaId: null, logoUrl: '' }));
  }

  function handleSubmit(event) {
    event.preventDefault();
    setIsSaving(true);
    saveBrandKit(values)
      .then((saved) => {
        setValues(saved);
        showToast({ type: 'success', title: t('ai.brandKit.saved') });
        onSaved?.(saved);
      })
      .catch((saveError) => showToast({ type: 'error', title: apiErrorMessage(saveError) }))
      .finally(() => setIsSaving(false));
  }

  if (error) return <CalloutBanner icon="AlertCircle" tone="danger">{error}</CalloutBanner>;
  if (!values) return <PageLoader minHeight="12rem" />;

  return (
    <form className="surface-card" onSubmit={handleSubmit}>
      <div className="d-flex justify-content-between align-items-start gap-3 flex-wrap mb-3">
        <div>
          <h3 className="h5 mb-1">{t('ai.brandKit.title')}</h3>
          <p className="form-hint mb-0">{t('ai.brandKit.intro')}</p>
        </div>
      </div>

      <label className="form-label" htmlFor="kit-website">
        {t('ai.brandKit.website')}
      </label>
      <div className="d-flex gap-2 mb-3 flex-wrap">
        <input
          id="kit-website"
          type="url"
          className="form-control brand-kit__website"
          placeholder="https://yourbusiness.com"
          value={values.website}
          onChange={(event) => update('website', event.target.value)}
        />
        <button type="button" className="btn btn-outline-secondary-custom d-inline-flex align-items-center gap-2" onClick={fillFromWebsite} disabled={isReading}>
          <Icon name="Wand2" size={16} /> {isReading ? t('ai.brandKit.reading') : t('ai.brandKit.fillFromWebsite')}
        </button>
      </div>

      <div className="row g-3">
        {FIELDS.map((field) => (
          <div key={field.key} className={field.wide ? 'col-12' : 'col-md-6'}>
            <label className="form-label" htmlFor={`kit-${field.key}`}>
              {t(`ai.brandKit.fields.${field.key}`)}
            </label>
            {field.rows ? (
              <textarea
                id={`kit-${field.key}`}
                className="form-control"
                rows={field.rows}
                placeholder={t(`ai.brandKit.placeholders.${field.key}`)}
                value={values[field.key]}
                onChange={(event) => update(field.key, event.target.value)}
              />
            ) : (
              <input
                id={`kit-${field.key}`}
                className="form-control"
                placeholder={t(`ai.brandKit.placeholders.${field.key}`)}
                value={values[field.key]}
                onChange={(event) => update(field.key, event.target.value)}
              />
            )}
          </div>
        ))}
        <div className="col-md-6">
          <label className="form-label" htmlFor="kit-color">
            {t('ai.brandKit.brandColor')}
          </label>
          <div className="d-flex gap-2 align-items-center">
            <input id="kit-color" type="color" className="form-control form-control-color" value={values.brandColor || '#4f46e5'} onChange={(event) => update('brandColor', event.target.value)} />
            <span className="form-hint">{values.brandColor}</span>
          </div>
        </div>
        <div className="col-md-6">
          <label className="form-label">{t('ai.brandKit.logo')}</label>
          <div className="d-flex gap-2 align-items-center flex-wrap">
            {values.logoUrl ? <img src={values.logoUrl} alt="" className="brand-kit__logo-preview" /> : null}
            <input ref={logoInputRef} type="file" accept="image/*" className="d-none" onChange={handleLogoChosen} />
            <button type="button" className="btn btn-outline-secondary-custom btn-sm" onClick={() => logoInputRef.current?.click()} disabled={isUploadingLogo}>
              {isUploadingLogo ? t('ai.brandKit.logoUploading') : values.logoUrl ? t('ai.brandKit.logoChange') : t('ai.brandKit.logoUpload')}
            </button>
            {values.logoUrl ? (
              <button type="button" className="btn btn-outline-danger btn-sm" onClick={removeLogo}>
                {t('ai.brandKit.logoRemove')}
              </button>
            ) : null}
          </div>
          <p className="form-hint mb-0">{t('ai.brandKit.logoHint')}</p>
        </div>
        <div className="col-md-6">
          <label className="form-label" htmlFor="kit-research">
            {t('ai.brandKit.autoResearch')}
          </label>
          <select id="kit-research" className="form-select" value={values.autoResearch} onChange={(event) => update('autoResearch', event.target.value)}>
            <option value="weekly">{t('ai.brandKit.researchWeekly')}</option>
            <option value="daily">{t('ai.brandKit.researchDaily')}</option>
            <option value="off">{t('ai.brandKit.researchOff')}</option>
          </select>
        </div>
      </div>

      <div className="d-flex justify-content-end mt-4">
        <button type="submit" className="btn btn-primary" disabled={isSaving}>
          {isSaving ? t('billing.saving') : t('ai.brandKit.save')}
        </button>
      </div>
    </form>
  );
}

export default BrandKitForm;
