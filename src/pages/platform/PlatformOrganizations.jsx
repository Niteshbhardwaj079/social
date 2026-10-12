import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useSelector } from 'react-redux';
import Modal from '../../components/common/Modal';
import EmptyState from '../../components/common/EmptyState';
import ErrorState from '../../components/common/ErrorState';
import PageLoader from '../../components/common/PageLoader';
import StatusBadge from '../../components/common/StatusBadge';
import { useToast } from '../../components/common/ToastProvider';
import HistoryList from '../../components/billing/HistoryList';
import ChangePlanForm from '../../components/billing/ChangePlanForm';
import { apiErrorMessage } from '../../services/api/axiosClient';
import { getOrganizationDetail, getOrganizations, getPlatformPlans, setOrganizationStatus } from '../../services/api/platformApi';
import { setOrganizationAiAccess } from '../../services/api/aiApi';
import { cycleLabel, formatMoney, formatShortDate, statusDisplay } from '../../utils/billingFormat';
import { useI18n } from '../../i18n/useI18n';

function Status({ status }) {
  const { t } = useI18n();
  const display = statusDisplay(status ?? '—', t);
  return <StatusBadge status={display.badge} label={display.label} />;
}

// Rendered only while open, with a `key` per organization, so it always starts fresh.
function OrganizationModal({ organizationId, plans, onClose, onChanged }) {
  const { t } = useI18n();
  const { showToast } = useToast();
  const ownOrganizationId = useSelector((state) => state.auth.currentUser?.organization?.id);
  const [detail, setDetail] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    getOrganizationDetail(organizationId)
      .then(setDetail)
      .catch((loadError) => setError(apiErrorMessage(loadError)));
  }, [organizationId]);

  function applyDetail(next) {
    setDetail(next);
    onChanged();
  }

  function toggleSuspended() {
    const next = detail.organization.status === 'active' ? 'suspended' : 'active';
    setOrganizationStatus(organizationId, next)
      .then((updated) => {
        showToast({ type: 'success', title: next === 'suspended' ? t('platform.orgs.suspended') : t('platform.orgs.reactivated') });
        applyDetail(updated);
      })
      .catch((statusError) => showToast({ type: 'error', title: apiErrorMessage(statusError) }));
  }

  function changeAiAccess(aiAccess) {
    setOrganizationAiAccess(organizationId, aiAccess)
      .then((updated) => {
        showToast({ type: 'success', title: t('platform.orgs.aiUpdated') });
        applyDetail(updated);
      })
      .catch((aiError) => showToast({ type: 'error', title: apiErrorMessage(aiError) }));
  }

  const organization = detail?.organization;
  return (
    <Modal isOpen onClose={onClose} title={organization?.name ?? t('platform.col.organization')} size="lg">
      {error ? <ErrorState description={error} /> : null}
      {!detail && !error ? <PageLoader minHeight="16rem" /> : null}
      {organization ? (
        <div className="d-flex flex-column gap-4">
          <div className="org-summary">
            <div>
              <div className="org-summary__label">{t('platform.orgs.owner')}</div>
              <div>{organization.ownerEmail ?? '—'}</div>
            </div>
            <div>
              <div className="org-summary__label">{t('billing.col.plan')}</div>
              <div>
                {organization.planName ?? '—'} <Status status={organization.subscriptionStatus} />
              </div>
            </div>
            <div>
              <div className="org-summary__label">{t('platform.col.validUntil')}</div>
              <div>{organization.currentPeriodEnd ? formatShortDate(organization.currentPeriodEnd) : t('billing.noEndDate')}</div>
            </div>
            <div>
              <div className="org-summary__label">{t('platform.col.people')}</div>
              <div>{organization.usersCount}</div>
            </div>
            <div>
              <div className="org-summary__label">{t('platform.orgs.joined')}</div>
              <div>{formatShortDate(organization.createdAt)}</div>
            </div>
            <div>
              <div className="org-summary__label">{t('platform.col.account')}</div>
              <div>
                <Status status={organization.status} />
              </div>
            </div>
          </div>

          <section>
            <h6>{t('platform.orgs.changePlan')}</h6>
            <ChangePlanForm organization={organization} plans={plans} onChanged={applyDetail} />
          </section>

          <section>
            <h6>{t('platform.orgs.aiTitle')}</h6>
            <div className="d-flex align-items-center gap-3 flex-wrap">
              <select
                className="form-select w-auto"
                value={organization.aiAccess}
                onChange={(event) => changeAiAccess(event.target.value)}
                aria-label={t('platform.orgs.aiTitle')}
              >
                <option value="enabled">{t('platform.orgs.aiEnabled')}</option>
                <option value="disabled">{t('platform.orgs.aiDisabled')}</option>
                <option value="hidden">{t('platform.orgs.aiHidden')}</option>
              </select>
              <span className="form-hint">{t('platform.orgs.aiHint')}</span>
            </div>
          </section>

          <section>
            <h6>{t('billing.tabs.payments')}</h6>
            {detail.payments.length ? (
              <ul className="org-list">
                {detail.payments.map((payment) => (
                  <li key={payment.id}>
                    <span>
                      {formatShortDate(payment.createdAt)} · {payment.planName} ({cycleLabel(payment.billingCycle, t)}) · {formatMoney(payment.amount, payment.currency)} ·{' '}
                      {t('platform.orgs.ref', { reference: payment.transactionId })}
                    </span>
                    <Status status={payment.status} />
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-secondary-custom small mb-0">{t('billing.payments.emptyTitle')}</p>
            )}
          </section>

          <section>
            <h6>{t('billing.tabs.invoices')}</h6>
            {detail.invoices.length ? (
              <ul className="org-list">
                {detail.invoices.map((invoice) => (
                  <li key={invoice.id}>
                    <Link to={`/platform/invoices/${invoice.id}`}>{invoice.invoiceNumber}</Link>
                    <span>
                      {formatShortDate(invoice.issuedAt)} · {formatMoney(invoice.total, invoice.currency)}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-secondary-custom small mb-0">{t('billing.invoices.emptyTitle')}</p>
            )}
          </section>

          <section>
            <h6>{t('billing.tabs.history')}</h6>
            <HistoryList history={detail.history} plans={plans} />
          </section>

          {organization.id !== ownOrganizationId ? (
            <section className="danger-zone">
              <div>
                <strong>{organization.status === 'active' ? t('platform.orgs.suspendTitle') : t('platform.orgs.reactivateTitle')}</strong>
                <div className="form-hint">{organization.status === 'active' ? t('platform.orgs.suspendText') : t('platform.orgs.reactivateText')}</div>
              </div>
              <button type="button" className={organization.status === 'active' ? 'btn btn-outline-danger' : 'btn btn-primary'} onClick={toggleSuspended}>
                {organization.status === 'active' ? t('platform.orgs.suspend') : t('platform.orgs.reactivate')}
              </button>
            </section>
          ) : null}
        </div>
      ) : null}
    </Modal>
  );
}

function PlatformOrganizations() {
  const { t } = useI18n();
  const [organizations, setOrganizations] = useState(null);
  const [plans, setPlans] = useState([]);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [openId, setOpenId] = useState(null);

  const load = useCallback(() => {
    Promise.all([getOrganizations(), getPlatformPlans()])
      .then(([orgs, planList]) => {
        setOrganizations(orgs);
        setPlans(planList);
      })
      .catch((loadError) => setError(apiErrorMessage(loadError)));
  }, []);

  useEffect(load, [load]);

  const visible = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!organizations || !term) return organizations;
    return organizations.filter((org) => `${org.name} ${org.ownerEmail ?? ''}`.toLowerCase().includes(term));
  }, [organizations, search]);

  if (error) {
    return (
      <ErrorState
        description={error}
        onRetry={() => {
          setError('');
          load();
        }}
      />
    );
  }
  if (!organizations) return <PageLoader minHeight="16rem" />;

  return (
    <div className="d-flex flex-column gap-3">
      <input type="search" className="form-control" placeholder={t('platform.orgs.search')} value={search} onChange={(event) => setSearch(event.target.value)} />
      {!visible.length ? (
        <EmptyState icon="Building2" title={t('platform.orgs.noneFound')} />
      ) : (
        <div className="data-table-wrapper">
          <table className="data-table data-table--stack">
            <thead>
              <tr>
                <th>{t('platform.col.organization')}</th>
                <th>{t('billing.col.plan')}</th>
                <th>{t('platform.col.validUntil')}</th>
                <th>{t('platform.col.people')}</th>
                <th>{t('platform.col.account')}</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {visible.map((org) => (
                <tr key={org.id}>
                  <td>
                    <div className="table-row-title">{org.name}</div>
                    <div className="table-row-subtitle">{org.ownerEmail}</div>
                  </td>
                  <td>
                    {org.planName ?? '—'} <Status status={org.subscriptionStatus} />
                    {org.pendingPayments ? <div className="table-row-subtitle">{t('platform.orgs.paymentsWaiting', { count: org.pendingPayments })}</div> : null}
                  </td>
                  <td>{org.currentPeriodEnd ? formatShortDate(org.currentPeriodEnd) : '—'}</td>
                  <td>{org.usersCount}</td>
                  <td>
                    <Status status={org.status} />
                  </td>
                  <td className="text-end">
                    <button type="button" className="btn btn-sm btn-outline-secondary-custom" onClick={() => setOpenId(org.id)}>
                      {t('platform.orgs.manage')}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {openId ? <OrganizationModal key={openId} organizationId={openId} plans={plans} onClose={() => setOpenId(null)} onChanged={load} /> : null}
    </div>
  );
}

export default PlatformOrganizations;
