import { useCallback, useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useDispatch, useSelector } from 'react-redux';
import PageHeader from '../../components/common/PageHeader';
import CalloutBanner from '../../components/common/CalloutBanner';
import EmptyState from '../../components/common/EmptyState';
import ErrorState from '../../components/common/ErrorState';
import PageLoader from '../../components/common/PageLoader';
import StatusBadge from '../../components/common/StatusBadge';
import Icon from '../../components/common/Icon';
import PayModal from '../../components/billing/PayModal';
import HistoryList from '../../components/billing/HistoryList';
import { useToast } from '../../components/common/ToastProvider';
import { API_ENABLED } from '../../config/runtime';
import { useI18n } from '../../i18n/useI18n';
import { apiErrorMessage } from '../../services/api/axiosClient';
import * as billingApi from '../../services/api/billingApi';
import { setCurrentPlan } from '../../store/slices/authSlice';
import {
  FEATURE_ROWS,
  LIMIT_ROWS,
  cycleLabel,
  formatAiCredits,
  formatLimit,
  formatMoney,
  formatShortDate,
  paymentMethodLabel,
  statusDisplay,
} from '../../utils/billingFormat';

// The label of each tab is billing.tabs.<key>.
const TABS = ['overview', 'plans', 'payments', 'invoices', 'history', 'details'];

function Status({ status }) {
  const { t } = useI18n();
  const display = statusDisplay(status, t);
  return <StatusBadge status={display.badge} label={display.label} />;
}

// ---------------------------------------------------------------- Overview tab
function UsageBar({ label, used, limit, unit }) {
  const { t } = useI18n();
  const unlimited = limit === null || limit === undefined;
  const percent = unlimited || !limit ? 0 : Math.min(100, Math.round((used / limit) * 100));
  return (
    <div className="usage-bar">
      <div className="usage-bar__top">
        <span>{label}</span>
        <span className="usage-bar__numbers">
          {unit === 'MB' ? formatLimit(used, 'MB', t) : used} / {formatLimit(limit, unit, t)}
        </span>
      </div>
      {!unlimited ? (
        <div className="usage-bar__track">
          <div className={`usage-bar__fill ${percent >= 90 ? 'is-full' : ''}`.trim()} style={{ width: `${percent}%` }} />
        </div>
      ) : null}
    </div>
  );
}

function OverviewTab({ overview, onUpgrade }) {
  const { t } = useI18n();
  const { subscription, effectivePlan, usage, pendingPayment } = overview;
  const isExpired = subscription.status === 'expired';
  return (
    <div className="d-flex flex-column gap-4">
      {pendingPayment ? (
        <CalloutBanner icon="Clock">
          {t('billing.overview.pendingPayment', {
            amount: formatMoney(pendingPayment.amount, pendingPayment.currency),
            plan: pendingPayment.planName,
            reference: pendingPayment.transactionId,
          })}
        </CalloutBanner>
      ) : null}
      {!isExpired && subscription.daysLeft !== null && subscription.daysLeft <= 7 ? (
        <CalloutBanner icon="AlertTriangle">
          {t(subscription.status === 'trialing' ? 'billing.overview.trialEndsSoon' : 'billing.overview.planEndsSoon', {
            plan: subscription.planName,
            days: subscription.daysLeft,
          })}
        </CalloutBanner>
      ) : null}
      {isExpired ? (
        <CalloutBanner icon="AlertTriangle" tone="danger">
          {t('billing.overview.planEnded', { plan: subscription.planName, date: formatShortDate(subscription.currentPeriodEnd) })}
        </CalloutBanner>
      ) : null}

      <section className="surface-card current-plan">
        <div className="current-plan__head">
          <div>
            <div className="current-plan__eyebrow">{t('billing.overview.currentPlan')}</div>
            <h3 className="current-plan__name">{subscription.planName}</h3>
            <div className="d-flex align-items-center gap-2 flex-wrap">
              <Status status={subscription.status} />
              {subscription.billingCycle ? <span className="text-secondary-custom small">{cycleLabel(subscription.billingCycle, t)}</span> : null}
            </div>
          </div>
          <button type="button" className="btn btn-primary" onClick={onUpgrade}>
            {subscription.planId === 'free' || isExpired ? t('billing.overview.upgrade') : t('billing.overview.changeOrRenew')}
          </button>
        </div>
        <div className="current-plan__dates">
          {subscription.currentPeriodEnd ? (
            <span>
              {isExpired ? t('billing.overview.endedOn') : subscription.status === 'trialing' ? t('billing.overview.trialEndsOn') : t('billing.overview.renewsOn')}{' '}
              <strong>{formatShortDate(subscription.currentPeriodEnd)}</strong>
              {subscription.daysLeft !== null ? ` · ${t('billing.overview.daysLeft', { days: subscription.daysLeft })}` : ''}
            </span>
          ) : (
            <span>{t('billing.noEndDate')}</span>
          )}
        </div>
      </section>

      <section className="surface-card">
        <h3 className="h5 mb-3">{t('billing.overview.usageOn', { plan: effectivePlan.name })}</h3>
        <div className="usage-grid">
          {LIMIT_ROWS.map((row) => (
            <UsageBar key={row.key} label={t(row.labelKey)} used={usage[row.key]} limit={effectivePlan.limits[row.key]} unit={row.unit} />
          ))}
        </div>
        <div className="feature-chips mt-4">
          {FEATURE_ROWS.map((row) => (
            <span key={row.key} className={`feature-chip ${effectivePlan.features[row.key] ? 'is-on' : 'is-off'}`}>
              <Icon name={effectivePlan.features[row.key] ? 'Check' : 'Lock'} size={14} /> {t(row.labelKey)}
            </span>
          ))}
        </div>
      </section>
    </div>
  );
}

// ---------------------------------------------------------------- Plans tab
function PlansTab({ overview, plans, canPay, onChoose }) {
  const { t } = useI18n();
  const [billingCycle, setBillingCycle] = useState('monthly');
  const { subscription, pendingPayment, paymentProviders } = overview;
  const paymentsReady = paymentProviders.length > 0;

  function buttonFor(plan) {
    const price = billingCycle === 'yearly' ? plan.priceYearly : plan.priceMonthly;
    if (price <= 0) return <span className="text-secondary-custom small">{plan.id === subscription.planId ? t('billing.plans.yourCurrentPlan') : t('billing.plans.freeForever')}</span>;
    const isCurrent = plan.id === subscription.planId && subscription.status === 'active';
    const label = isCurrent ? t('billing.plans.renew') : t('billing.plans.choose');
    const disabledReason = !canPay
      ? t('billing.plans.askAdmin')
      : pendingPayment
        ? t('billing.plans.paymentWaiting')
        : !paymentsReady
          ? t('billing.plans.paymentsNotReady')
          : '';
    return (
      <>
        <button type="button" className={`btn w-100 ${isCurrent ? 'btn-outline-secondary-custom' : 'btn-primary'}`} disabled={Boolean(disabledReason)} onClick={() => onChoose(plan, billingCycle)}>
          {label}
        </button>
        {disabledReason ? <div className="form-hint mt-2">{disabledReason}</div> : null}
      </>
    );
  }

  return (
    <div className="d-flex flex-column gap-4">
      <div className="d-flex justify-content-between align-items-center flex-wrap gap-3">
        <div className="segmented-control" role="group" aria-label={t('billing.plans.cycleLabel')}>
          {['monthly', 'yearly'].map((cycle) => (
            <button key={cycle} type="button" className={`segmented-control__item ${billingCycle === cycle ? 'is-active' : ''}`.trim()} onClick={() => setBillingCycle(cycle)}>
              {cycleLabel(cycle, t)}
            </button>
          ))}
        </div>
        {overview.tax.rate > 0 ? <span className="form-hint">{t('billing.plans.pricesExcludeTax', { tax: overview.tax.label, rate: overview.tax.rate })}</span> : null}
      </div>

      <div className="plan-grid">
        {plans.map((plan) => {
          const price = billingCycle === 'yearly' ? plan.priceYearly : plan.priceMonthly;
          const isCurrent = plan.id === subscription.planId;
          return (
            <section key={plan.id} className={`plan-card ${isCurrent ? 'is-current' : ''}`.trim()}>
              {isCurrent ? <span className="plan-card__badge">{t('billing.plans.current')}</span> : null}
              <h3 className="plan-card__name">{plan.name}</h3>
              <p className="plan-card__description">{plan.description}</p>
              <div className="plan-card__price">
                {formatMoney(price, plan.currency)}
                <span>/{billingCycle === 'yearly' ? t('billing.perYear') : t('billing.perMonth')}</span>
              </div>
              <ul className="plan-card__list">
                {LIMIT_ROWS.map((row) => (
                  <li key={row.key}>
                    <Icon name="Check" size={14} /> {t(row.lineKey, { value: formatLimit(plan.limits[row.key], row.unit, t) })}
                  </li>
                ))}
                {plan.features.ai ? (
                  <li>
                    <Icon name="Check" size={14} /> {formatAiCredits(plan.aiCreditsPerMonth, t)}
                  </li>
                ) : null}
                {FEATURE_ROWS.map((row) => (
                  <li key={row.key} className={plan.features[row.key] ? '' : 'is-off'}>
                    <Icon name={plan.features[row.key] ? 'Check' : 'X'} size={14} /> {t(row.labelKey)}
                  </li>
                ))}
              </ul>
              <div className="plan-card__action">{buttonFor(plan)}</div>
            </section>
          );
        })}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- Payments / Invoices / History tabs
function PaymentsTab({ payments }) {
  const { t } = useI18n();
  const { showToast } = useToast();
  if (!payments.length) return <EmptyState icon="CreditCard" title={t('billing.payments.emptyTitle')} description={t('billing.payments.emptyText')} />;

  function openProof(id) {
    billingApi
      .getPaymentProofUrl(id)
      .then((url) => window.open(url, '_blank', 'noopener'))
      .catch((error) => showToast({ type: 'error', title: apiErrorMessage(error) }));
  }

  return (
    <div className="data-table-wrapper">
      <table className="data-table data-table--stack">
        <thead>
          <tr>
            <th>{t('billing.col.date')}</th>
            <th>{t('billing.col.plan')}</th>
            <th>{t('billing.col.amount')}</th>
            <th>{t('billing.col.transactionId')}</th>
            <th>{t('billing.col.status')}</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {payments.map((payment) => (
            <tr key={payment.id}>
              <td>{formatShortDate(payment.createdAt)}</td>
              <td>
                {payment.planName} · {cycleLabel(payment.billingCycle, t)}
              </td>
              <td>{formatMoney(payment.amount, payment.currency)}</td>
              <td>
                <div>{payment.transactionId}</div>
                <div className="table-row-subtitle">{paymentMethodLabel(payment.method, t)}</div>
              </td>
              <td>
                <Status status={payment.status} />
                {payment.reviewNote ? <div className="table-row-subtitle mt-1">{payment.reviewNote}</div> : null}
              </td>
              <td className="text-end text-nowrap">
                {payment.hasProof ? (
                  <button type="button" className="btn btn-sm btn-outline-secondary-custom me-2" onClick={() => openProof(payment.id)}>
                    {t('billing.screenshot')}
                  </button>
                ) : null}
                {payment.invoiceId ? (
                  <Link className="btn btn-sm btn-outline-secondary-custom" to={`/billing/invoices/${payment.invoiceId}`}>
                    {t('billing.invoice')}
                  </Link>
                ) : null}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function InvoicesTab({ invoices }) {
  const { t } = useI18n();
  if (!invoices.length) return <EmptyState icon="FileText" title={t('billing.invoices.emptyTitle')} description={t('billing.invoices.emptyText')} />;
  return (
    <div className="data-table-wrapper">
      <table className="data-table data-table--stack">
        <thead>
          <tr>
            <th>{t('billing.col.invoice')}</th>
            <th>{t('billing.col.date')}</th>
            <th>{t('billing.col.plan')}</th>
            <th>{t('billing.col.period')}</th>
            <th>{t('billing.col.total')}</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {invoices.map((invoice) => (
            <tr key={invoice.id}>
              <td className="table-row-title">
                {invoice.invoiceNumber}
                {invoice.status === 'void' ? <span className="status-badge status-badge--failed ms-2">{t('billing.void')}</span> : null}
              </td>
              <td>{formatShortDate(invoice.issuedAt)}</td>
              <td>
                {invoice.planName} · {cycleLabel(invoice.billingCycle, t)}
              </td>
              <td>
                {formatShortDate(invoice.periodStart)} – {formatShortDate(invoice.periodEnd)}
              </td>
              <td>{formatMoney(invoice.total, invoice.currency)}</td>
              <td className="text-end">
                <Link className="btn btn-sm btn-outline-secondary-custom" to={`/billing/invoices/${invoice.id}`}>
                  {t('billing.invoices.viewPrint')}
                </Link>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ---------------------------------------------------------------- Billing details tab
function DetailsTab({ initial, canEdit, onSaved }) {
  const { t } = useI18n();
  const { showToast } = useToast();
  const [values, setValues] = useState(initial);
  const [isSaving, setIsSaving] = useState(false);
  const update = (field, value) => setValues((current) => ({ ...current, [field]: value }));

  function handleSubmit(event) {
    event.preventDefault();
    setIsSaving(true);
    billingApi
      .saveBillingDetails(values)
      .then((saved) => {
        onSaved(saved);
        showToast({ type: 'success', title: t('billing.details.savedTitle'), message: t('billing.details.savedText') });
      })
      .catch((error) => showToast({ type: 'error', title: apiErrorMessage(error) }))
      .finally(() => setIsSaving(false));
  }

  return (
    <form className="surface-card" onSubmit={handleSubmit}>
      <p className="form-hint">{t('billing.details.intro')}</p>
      <fieldset disabled={!canEdit || isSaving} className="row g-3">
        <div className="col-md-6">
          <label className="form-label" htmlFor="bill-name">
            {t('billing.details.name')}
          </label>
          <input id="bill-name" className="form-control" value={values.name} onChange={(event) => update('name', event.target.value)} maxLength={160} />
        </div>
        <div className="col-md-6">
          <label className="form-label" htmlFor="bill-email">
            {t('billing.details.email')}
          </label>
          <input id="bill-email" type="email" className="form-control" value={values.email} onChange={(event) => update('email', event.target.value)} maxLength={254} />
        </div>
        <div className="col-12">
          <label className="form-label" htmlFor="bill-address">
            {t('billing.details.address')}
          </label>
          <textarea id="bill-address" className="form-control" rows={3} value={values.address} onChange={(event) => update('address', event.target.value)} maxLength={500} />
        </div>
        <div className="col-md-6">
          <label className="form-label" htmlFor="bill-gstin">
            {t('billing.details.gstin')}
          </label>
          <input id="bill-gstin" className="form-control" value={values.gstin} onChange={(event) => update('gstin', event.target.value.toUpperCase())} maxLength={20} />
        </div>
      </fieldset>
      {canEdit ? (
        <div className="d-flex justify-content-end mt-4">
          <button type="submit" className="btn btn-primary" disabled={isSaving}>
            {isSaving ? t('billing.saving') : t('billing.details.save')}
          </button>
        </div>
      ) : (
        <p className="form-hint mt-3 mb-0">{t('billing.details.onlyAdmins')}</p>
      )}
    </form>
  );
}

// ---------------------------------------------------------------- the page
function Billing() {
  const { t } = useI18n();
  const dispatch = useDispatch();
  const [searchParams, setSearchParams] = useSearchParams();
  const activeTab = TABS.includes(searchParams.get('tab')) ? searchParams.get('tab') : 'overview';
  const canEdit = useSelector((state) => state.auth.currentUser?.permissions?.settingsEdit === true);

  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [payTarget, setPayTarget] = useState(null); // { plan, billingCycle }

  const load = useCallback(() => {
    return Promise.all([billingApi.getBillingOverview(), billingApi.getPlans(), billingApi.getPayments(), billingApi.getInvoices(), billingApi.getBillingHistory()])
      .then(([overview, plans, payments, invoices, history]) => {
        setData({ overview, plans, payments, invoices, history });
        // Keep the sidebar's locked/unlocked modules in step with the plan.
        dispatch(setCurrentPlan({ id: overview.effectivePlan.id, name: overview.effectivePlan.name, features: overview.effectivePlan.features }));
      })
      .catch((loadError) => setError(apiErrorMessage(loadError)));
  }, [dispatch]);

  useEffect(() => {
    if (API_ENABLED) load();
  }, [load]);

  const openTab = (key) => setSearchParams(key === 'overview' ? {} : { tab: key });

  const header = <PageHeader title={t('billing.title')} subtitle={t('billing.subtitle')} />;
  if (!API_ENABLED) {
    return (
      <div className="fade-in">
        {header}
        <EmptyState icon="CreditCard" title={t('billing.needsServerTitle')} description={t('billing.needsServerText')} />
      </div>
    );
  }
  if (error) {
    return (
      <div className="fade-in">
        {header}
        <ErrorState
          description={error}
          onRetry={() => {
            setError('');
            load();
          }}
        />
      </div>
    );
  }
  if (!data) {
    return (
      <div className="fade-in">
        {header}
        <PageLoader minHeight="24rem" />
      </div>
    );
  }

  return (
    <div className="fade-in">
      {header}
      <nav className="tab-strip mb-4" aria-label={t('billing.title')}>
        {TABS.map((tab) => (
          <button key={tab} type="button" className={`tab-strip__item ${activeTab === tab ? 'is-active' : ''}`.trim()} onClick={() => openTab(tab)}>
            {t(`billing.tabs.${tab}`)}
          </button>
        ))}
      </nav>

      {activeTab === 'overview' ? <OverviewTab overview={data.overview} onUpgrade={() => openTab('plans')} /> : null}
      {activeTab === 'plans' ? (
        <PlansTab overview={data.overview} plans={data.plans} canPay={canEdit} onChoose={(plan, billingCycle) => setPayTarget({ plan, billingCycle })} />
      ) : null}
      {activeTab === 'payments' ? <PaymentsTab payments={data.payments} /> : null}
      {activeTab === 'invoices' ? <InvoicesTab invoices={data.invoices} /> : null}
      {activeTab === 'history' ? <HistoryList history={data.history} plans={data.plans} /> : null}
      {activeTab === 'details' ? (
        <DetailsTab
          initial={data.overview.billingDetails}
          canEdit={canEdit}
          onSaved={(billingDetails) => setData((current) => ({ ...current, overview: { ...current.overview, billingDetails } }))}
        />
      ) : null}

      {payTarget ? (
        <PayModal
          key={`${payTarget.plan.id}-${payTarget.billingCycle}`}
          plan={payTarget.plan}
          billingCycle={payTarget.billingCycle}
          onClose={() => setPayTarget(null)}
          onSubmitted={() => {
            setPayTarget(null);
            load().then(() => openTab('payments'));
          }}
        />
      ) : null}
    </div>
  );
}

export default Billing;
