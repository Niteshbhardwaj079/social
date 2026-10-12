import { useEffect, useState } from 'react';
import ErrorState from '../../components/common/ErrorState';
import PageLoader from '../../components/common/PageLoader';
import { useToast } from '../../components/common/ToastProvider';
import { apiErrorMessage } from '../../services/api/axiosClient';
import { getPlatformPlans, getPlatformSettings, savePlatformSettings } from '../../services/api/platformApi';
import { useI18n } from '../../i18n/useI18n';

/**
 * The form, grouped the way the owner thinks about it. `type` defaults to text.
 * Texts: platform.settings.sections.<key>.title / .hint, and platform.settings.fields.<field key>.
 */
const SECTIONS = [
  {
    key: 'payment',
    hasHint: true,
    fields: [
      { key: 'upiId', placeholder: 'yourname@bank' },
      { key: 'upiName' },
      { key: 'bankAccountName' },
      { key: 'bankAccountNumber' },
      { key: 'bankIfsc' },
      { key: 'bankName' },
      { key: 'paymentNote', type: 'textarea', wide: true },
    ],
  },
  {
    key: 'company',
    fields: [{ key: 'companyName' }, { key: 'companyGstin' }, { key: 'companyEmail' }, { key: 'companyPhone' }, { key: 'companyAddress', type: 'textarea', wide: true }],
  },
  {
    key: 'tax',
    hasHint: true,
    fields: [
      { key: 'taxLabel', placeholder: 'GST' },
      { key: 'taxRate', type: 'number' },
      { key: 'invoicePrefix', placeholder: 'INV' },
    ],
  },
];

function PlatformSettings() {
  const { t } = useI18n();
  const { showToast } = useToast();
  const [values, setValues] = useState(null);
  const [plans, setPlans] = useState([]);
  const [error, setError] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    Promise.all([getPlatformSettings(), getPlatformPlans()])
      .then(([settings, planList]) => {
        setValues(settings);
        setPlans(planList);
      })
      .catch((loadError) => setError(apiErrorMessage(loadError)));
  }, []);

  const update = (key, value) => setValues((current) => ({ ...current, [key]: value }));

  function handleSubmit(event) {
    event.preventDefault();
    setIsSaving(true);
    savePlatformSettings({ ...values, taxRate: Number(values.taxRate) || 0, trialDays: Math.max(0, Math.round(Number(values.trialDays) || 0)) })
      .then((saved) => {
        setValues(saved);
        showToast({ type: 'success', title: t('platform.settings.saved') });
      })
      .catch((saveError) => showToast({ type: 'error', title: apiErrorMessage(saveError) }))
      .finally(() => setIsSaving(false));
  }

  if (error) return <ErrorState description={error} />;
  if (!values) return <PageLoader minHeight="16rem" />;

  return (
    <form className="d-flex flex-column gap-4" onSubmit={handleSubmit}>
      <section className="surface-card">
        <h3 className="h5 mb-1">{t('platform.settings.signupTitle')}</h3>
        <p className="form-hint mb-3">{t('platform.settings.signupHint')}</p>
        <div className="row g-3">
          <div className="col-12">
            <div className="form-check form-switch">
              <input
                id="signup-enabled"
                type="checkbox"
                className="form-check-input"
                role="switch"
                checked={values.signupEnabled}
                onChange={(event) => update('signupEnabled', event.target.checked)}
              />
              <label className="form-check-label" htmlFor="signup-enabled">
                {t('platform.settings.signupEnabled')}
              </label>
            </div>
          </div>
          <div className="col-sm-6">
            <label className="form-label" htmlFor="trial-plan">
              {t('platform.settings.trialPlan')}
            </label>
            <select id="trial-plan" className="form-select" value={values.trialPlanId} onChange={(event) => update('trialPlanId', event.target.value)}>
              {plans.map((plan) => (
                <option key={plan.id} value={plan.id}>
                  {plan.name}
                </option>
              ))}
            </select>
          </div>
          <div className="col-sm-6">
            <label className="form-label" htmlFor="trial-days">
              {t('platform.settings.trialDays')}
            </label>
            <input id="trial-days" type="number" min="0" max="365" className="form-control" value={values.trialDays} onChange={(event) => update('trialDays', event.target.value)} />
          </div>
        </div>
      </section>

      {SECTIONS.map((section) => (
        <section key={section.key} className="surface-card">
          <h3 className="h5 mb-1">{t(`platform.settings.sections.${section.key}.title`)}</h3>
          {section.hasHint ? <p className="form-hint mb-3">{t(`platform.settings.sections.${section.key}.hint`)}</p> : <div className="mb-3" />}
          <div className="row g-3">
            {section.fields.map((field) => (
              <div key={field.key} className={field.wide ? 'col-12' : 'col-sm-6'}>
                <label className="form-label" htmlFor={`ps-${field.key}`}>
                  {t(`platform.settings.fields.${field.key}`)}
                </label>
                {field.type === 'textarea' ? (
                  <textarea id={`ps-${field.key}`} className="form-control" rows={3} value={values[field.key] ?? ''} onChange={(event) => update(field.key, event.target.value)} />
                ) : (
                  <input
                    id={`ps-${field.key}`}
                    type={field.type ?? 'text'}
                    className="form-control"
                    placeholder={field.placeholder}
                    value={values[field.key] ?? ''}
                    onChange={(event) => update(field.key, event.target.value)}
                  />
                )}
              </div>
            ))}
          </div>
        </section>
      ))}

      <div className="d-flex justify-content-end">
        <button type="submit" className="btn btn-primary" disabled={isSaving}>
          {isSaving ? t('billing.saving') : t('platform.settings.save')}
        </button>
      </div>
    </form>
  );
}

export default PlatformSettings;
