import { useEffect, useState } from 'react';
import ErrorState from '../../components/common/ErrorState';
import PageLoader from '../../components/common/PageLoader';
import { useToast } from '../../components/common/ToastProvider';
import { apiErrorMessage } from '../../services/api/axiosClient';
import { createPlatformPlan, deletePlatformPlan, getPlatformPlans, updatePlatformPlan } from '../../services/api/platformApi';
import { FEATURE_ROWS, LIMIT_ROWS } from '../../utils/billingFormat';
import { useI18n } from '../../i18n/useI18n';

// A limit box: empty = unlimited (sent as null), otherwise a whole number.
const toInput = (value) => (value === null || value === undefined ? '' : String(value));
const fromInput = (value) => (value.trim() === '' ? null : Math.max(0, Math.round(Number(value))));

/** One plan's edit form. Saving changes it for new purchases; current subscribers keep their plan id. */
function PlanEditor({ plan, onSaved, onDeleted }) {
  const { t } = useI18n();
  const { showToast } = useToast();
  const [values, setValues] = useState(() => ({
    name: plan.name,
    description: plan.description,
    priceMonthly: String(plan.priceMonthly),
    priceYearly: String(plan.priceYearly),
    currency: plan.currency,
    isActive: plan.isActive,
    limits: Object.fromEntries(LIMIT_ROWS.map((row) => [row.key, toInput(plan.limits[row.key])])),
    features: { ...plan.features },
    aiCreditsPerMonth: toInput(plan.aiCreditsPerMonth),
  }));
  const [isSaving, setIsSaving] = useState(false);
  const update = (field, value) => setValues((current) => ({ ...current, [field]: value }));

  // Only a plan nobody ever used can be deleted; the server says "hide it instead" otherwise.
  function handleDelete() {
    if (!window.confirm(t('platform.plans.deleteConfirm', { name: plan.name }))) return;
    deletePlatformPlan(plan.id)
      .then(() => {
        showToast({ type: 'success', title: t('platform.plans.deleted', { name: plan.name }) });
        onDeleted(plan.id);
      })
      .catch((error) => showToast({ type: 'error', title: apiErrorMessage(error) }));
  }

  function handleSubmit(event) {
    event.preventDefault();
    const priceMonthly = Number(values.priceMonthly);
    const priceYearly = Number(values.priceYearly);
    if (!Number.isFinite(priceMonthly) || !Number.isFinite(priceYearly) || priceMonthly < 0 || priceYearly < 0) {
      showToast({ type: 'error', title: t('platform.plans.pricesInvalid') });
      return;
    }
    setIsSaving(true);
    updatePlatformPlan(plan.id, {
      name: values.name.trim(),
      description: values.description.trim(),
      priceMonthly,
      priceYearly,
      currency: values.currency.trim().toUpperCase(),
      isActive: values.isActive,
      limits: Object.fromEntries(Object.entries(values.limits).map(([key, value]) => [key, fromInput(value)])),
      features: values.features,
      aiCreditsPerMonth: fromInput(values.aiCreditsPerMonth),
    })
      .then((saved) => {
        showToast({ type: 'success', title: t('platform.plans.saved', { name: saved.name }) });
        onSaved(saved);
      })
      .catch((error) => showToast({ type: 'error', title: apiErrorMessage(error) }))
      .finally(() => setIsSaving(false));
  }

  return (
    <form className="surface-card" onSubmit={handleSubmit}>
      <div className="d-flex justify-content-between align-items-center mb-3 gap-3 flex-wrap">
        <h3 className="h5 mb-0">
          {plan.name} <span className="text-secondary-custom small">({plan.id})</span>
        </h3>
        <div className="form-check form-switch mb-0">
          <input
            id={`plan-active-${plan.id}`}
            type="checkbox"
            className="form-check-input"
            role="switch"
            checked={values.isActive}
            disabled={plan.id === 'free'}
            onChange={(event) => update('isActive', event.target.checked)}
          />
          <label className="form-check-label" htmlFor={`plan-active-${plan.id}`}>
            {t('platform.plans.shown')}
          </label>
        </div>
      </div>

      <div className="row g-3">
        <div className="col-md-4">
          <label className="form-label">{t('platform.plans.name')}</label>
          <input className="form-control" value={values.name} onChange={(event) => update('name', event.target.value)} maxLength={60} required />
        </div>
        <div className="col-md-8">
          <label className="form-label">{t('platform.plans.description')}</label>
          <input className="form-control" value={values.description} onChange={(event) => update('description', event.target.value)} maxLength={300} />
        </div>
        <div className="col-sm-4">
          <label className="form-label">{t('platform.plans.priceMonth')}</label>
          <input type="number" min="0" step="0.01" className="form-control" value={values.priceMonthly} onChange={(event) => update('priceMonthly', event.target.value)} />
        </div>
        <div className="col-sm-4">
          <label className="form-label">{t('platform.plans.priceYear')}</label>
          <input type="number" min="0" step="0.01" className="form-control" value={values.priceYearly} onChange={(event) => update('priceYearly', event.target.value)} />
        </div>
        <div className="col-sm-4">
          <label className="form-label">{t('platform.plans.currency')}</label>
          <input className="form-control" value={values.currency} onChange={(event) => update('currency', event.target.value)} maxLength={3} />
        </div>

        {LIMIT_ROWS.map((row) => (
          <div key={row.key} className="col-sm-6 col-lg-3">
            <label className="form-label">
              {t(row.labelKey)}
              {row.unit ? ` (${row.unit})` : ''}
            </label>
            <input
              type="number"
              min="0"
              className="form-control"
              placeholder={t('billing.unlimited')}
              value={values.limits[row.key]}
              onChange={(event) => setValues((current) => ({ ...current, limits: { ...current.limits, [row.key]: event.target.value } }))}
            />
          </div>
        ))}
        <div className="col-sm-6 col-lg-3">
          <label className="form-label" htmlFor={`plan-${plan.id}-credits`}>
            {t('platform.plans.aiCredits')}
          </label>
          <input
            id={`plan-${plan.id}-credits`}
            type="number"
            min="0"
            className="form-control"
            placeholder={t('billing.unlimited')}
            value={values.aiCreditsPerMonth}
            onChange={(event) => update('aiCreditsPerMonth', event.target.value)}
          />
          <div className="form-hint">{t('platform.plans.aiCreditsHint')}</div>
        </div>
      </div>

      <div className="d-flex flex-wrap gap-4 mt-3">
        {FEATURE_ROWS.map((row) => (
          <div key={row.key} className="form-check mb-0">
            <input
              id={`plan-${plan.id}-${row.key}`}
              type="checkbox"
              className="form-check-input"
              checked={values.features[row.key]}
              onChange={(event) => setValues((current) => ({ ...current, features: { ...current.features, [row.key]: event.target.checked } }))}
            />
            <label className="form-check-label" htmlFor={`plan-${plan.id}-${row.key}`}>
              {t(row.labelKey)}
            </label>
          </div>
        ))}
      </div>

      <div className="d-flex justify-content-between align-items-center mt-4 gap-3 flex-wrap">
        <span className="form-hint">{t('platform.plans.editorHint')}</span>
        <div className="d-flex gap-2">
          {plan.id !== 'free' ? (
            <button type="button" className="btn btn-outline-danger" onClick={handleDelete} disabled={isSaving}>
              {t('common.delete')}
            </button>
          ) : null}
          <button type="submit" className="btn btn-primary" disabled={isSaving}>
            {isSaving ? t('billing.saving') : t('platform.plans.save')}
          </button>
        </div>
      </div>
    </form>
  );
}

function PlatformPlans() {
  const [plans, setPlans] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    getPlatformPlans()
      .then(setPlans)
      .catch((loadError) => setError(apiErrorMessage(loadError)));
  }, []);

  if (error) return <ErrorState description={error} />;
  if (!plans) return <PageLoader minHeight="16rem" />;

  return (
    <div className="d-flex flex-column gap-4">
      <NewPlanForm onCreated={(plan) => setPlans((current) => [...current, plan])} />
      {plans.map((plan) => (
        <PlanEditor
          key={plan.id}
          plan={plan}
          onSaved={(saved) => setPlans((current) => current.map((item) => (item.id === saved.id ? saved : item)))}
          onDeleted={(id) => setPlans((current) => current.filter((item) => item.id !== id))}
        />
      ))}
    </div>
  );
}

/** A brand-new plan: name and prices here, the rest (limits, modules) in its editor below. Starts hidden. */
function NewPlanForm({ onCreated }) {
  const { t } = useI18n();
  const { showToast } = useToast();
  const [values, setValues] = useState({ name: '', priceMonthly: '', priceYearly: '' });
  const [isSaving, setIsSaving] = useState(false);

  function handleSubmit(event) {
    event.preventDefault();
    if (!values.name.trim()) return showToast({ type: 'error', title: t('platform.plans.nameRequired') });
    setIsSaving(true);
    createPlatformPlan({ name: values.name.trim(), priceMonthly: Number(values.priceMonthly) || 0, priceYearly: Number(values.priceYearly) || 0 })
      .then((plan) => {
        setValues({ name: '', priceMonthly: '', priceYearly: '' });
        showToast({ type: 'success', title: t('platform.plans.created', { name: plan.name }), message: t('platform.plans.createdText') });
        onCreated(plan);
      })
      .catch((error) => showToast({ type: 'error', title: apiErrorMessage(error) }))
      .finally(() => setIsSaving(false));
  }

  return (
    <form className="surface-card row g-2 align-items-end" onSubmit={handleSubmit}>
      <div className="col-12">
        <h3 className="h5 mb-0">{t('platform.plans.newTitle')}</h3>
      </div>
      <div className="col-md-5">
        <label className="form-label" htmlFor="new-plan-name">
          {t('platform.plans.name')}
        </label>
        <input
          id="new-plan-name"
          className="form-control"
          value={values.name}
          onChange={(event) => setValues((current) => ({ ...current, name: event.target.value }))}
          placeholder={t('platform.plans.namePlaceholder')}
          maxLength={60}
        />
      </div>
      <div className="col-sm-6 col-md-2">
        <label className="form-label" htmlFor="new-plan-monthly">
          {t('platform.plans.priceMonth')}
        </label>
        <input id="new-plan-monthly" type="number" min="0" step="0.01" className="form-control" value={values.priceMonthly} onChange={(event) => setValues((current) => ({ ...current, priceMonthly: event.target.value }))} />
      </div>
      <div className="col-sm-6 col-md-2">
        <label className="form-label" htmlFor="new-plan-yearly">
          {t('platform.plans.priceYear')}
        </label>
        <input id="new-plan-yearly" type="number" min="0" step="0.01" className="form-control" value={values.priceYearly} onChange={(event) => setValues((current) => ({ ...current, priceYearly: event.target.value }))} />
      </div>
      <div className="col-md-3">
        <button type="submit" className="btn btn-primary w-100" disabled={isSaving}>
          {isSaving ? t('platform.plans.creating') : t('platform.plans.create')}
        </button>
      </div>
    </form>
  );
}

export default PlatformPlans;
