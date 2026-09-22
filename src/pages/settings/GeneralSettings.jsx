import { useState } from 'react';
import { Link } from 'react-router-dom';
import TextField from '../../components/forms/TextField';
import { useToast } from '../../components/common/ToastProvider';
import brand from '../../config/brand';
import { useI18n } from '../../i18n/useI18n';

const TIMEZONES = ['Asia/Kolkata', 'Asia/Dubai', 'Europe/London', 'America/New_York'];

function GeneralSettings() {
  const { t, languageInfo } = useI18n();
  const { showToast } = useToast();
  const [formValues, setFormValues] = useState({
    workspaceName: 'Gowebkart Workspace',
    website: brand.website,
    timezone: TIMEZONES[0],
  });

  function handleChange(field, value) {
    setFormValues((current) => ({ ...current, [field]: value }));
  }

  function handleSubmit(event) {
    event.preventDefault();
    showToast({ type: 'success', title: t('common.settingsSaved') });
  }

  return (
    <form className="surface-card" onSubmit={handleSubmit}>
      <h3 className="h5 mb-4">{t('settings.general.details')}</h3>

      <div className="form-grid-2">
      <TextField
        id="workspaceName"
        label={t('settings.general.name')}
        value={formValues.workspaceName}
        onChange={(event) => handleChange('workspaceName', event.target.value)}
      />
      <TextField
        id="website"
        label={t('settings.general.website')}
        value={formValues.website}
        onChange={(event) => handleChange('website', event.target.value)}
      />
      </div>

      <div className="row g-3 mb-4">
        <div className="col-md-6">
          <label htmlFor="timezone" className="form-label-custom">
            {t('settings.general.timezone')}
          </label>
          <select
            id="timezone"
            className="form-select"
            value={formValues.timezone}
            onChange={(event) => handleChange('timezone', event.target.value)}
          >
            {TIMEZONES.map((timezone) => (
              <option key={timezone} value={timezone}>
                {timezone}
              </option>
            ))}
          </select>
        </div>
        <div className="col-md-6">
          <label htmlFor="language" className="form-label-custom">
            {t('settings.general.language')}
          </label>
          <Link to="/settings/language" className="btn btn-outline-secondary-custom w-100 justify-content-start">
            <span lang={languageInfo.htmlLang}>{languageInfo.nativeName}</span>
            <span className="ms-auto small text-muted-custom">{t('settings.general.changeLanguage')}</span>
          </Link>
        </div>
      </div>

      <p className="form-hint mb-4">
        {t('settings.general.supportLead', { product: brand.productName, company: brand.legalName })}{' '}
        <a href={`mailto:${brand.supportEmail}`}>{brand.supportEmail}</a>.
      </p>

      <button type="submit" className="btn btn-primary">
        {t('common.saveChanges')}
      </button>
    </form>
  );
}

export default GeneralSettings;
