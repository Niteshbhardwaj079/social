import { useEffect, useState } from 'react';
import Modal from '../common/Modal';
import TextField from '../forms/TextField';
import { AD_RULE_ACTIONS, AD_RULE_COMPARATORS, AD_RULE_METRICS, AD_RULE_WINDOWS } from '../../config/adPlatforms';
import { useI18n } from '../../i18n/useI18n';

function emptyForm(accounts) {
  return {
    name: '',
    adAccountId: accounts[0]?.id || '',
    metric: 'spend',
    comparator: 'gt',
    threshold: '',
    windowDays: 7,
    action: 'pause',
    cooldownHours: 24,
    isActive: true,
  };
}

// Pass `rule` to edit an existing one instead of creating a new one — the form prefills from it.
function RuleFormModal({ isOpen, onClose, onSubmit, rule, accounts }) {
  const { t } = useI18n();
  const isEditing = Boolean(rule);
  const [form, setForm] = useState(() => emptyForm(accounts));

  useEffect(() => {
    if (!isOpen) return;
    setForm(
      rule
        ? {
            name: rule.name,
            adAccountId: rule.adAccountId,
            metric: rule.metric,
            comparator: rule.comparator,
            threshold: String(rule.threshold),
            windowDays: rule.windowDays,
            action: rule.action,
            cooldownHours: rule.cooldownHours,
            isActive: rule.isActive,
          }
        : emptyForm(accounts)
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, rule]);

  const update = (patch) => setForm((current) => ({ ...current, ...patch }));
  const metricConfig = AD_RULE_METRICS.find((item) => item.key === form.metric);

  function handleSubmit(event) {
    event.preventDefault();
    onSubmit({ ...form, threshold: Number(form.threshold), windowDays: Number(form.windowDays), cooldownHours: Number(form.cooldownHours) });
  }

  const footer = (
    <>
      <button type="button" className="btn btn-outline-secondary-custom" onClick={onClose}>
        {t('common.cancel')}
      </button>
      <button type="submit" form="rule-form" className="btn btn-primary" disabled={!form.adAccountId || !form.threshold}>
        {isEditing ? t('common.saveChanges') : t('ads.createRuleButton')}
      </button>
    </>
  );

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={isEditing ? t('ads.editRuleTitle') : t('ads.newRuleTitle')} footer={footer} size="lg">
      <form id="rule-form" onSubmit={handleSubmit}>
        <TextField id="ruleName" label={t('ads.ruleNameLabel')} value={form.name} onChange={(event) => update({ name: event.target.value })} placeholder={t('ads.ruleNamePlaceholder')} required />

        {accounts.length === 0 ? (
          <p className="text-muted-custom">{t('ads.noAccountsForRule')}</p>
        ) : (
          <div className="mb-4">
            <label htmlFor="ruleAccount" className="form-label-custom">{t('ads.adAccount')}</label>
            <select id="ruleAccount" className="form-select" value={form.adAccountId} onChange={(event) => update({ adAccountId: event.target.value })}>
              {accounts.map((account) => (
                <option key={account.id} value={account.id}>{account.name}</option>
              ))}
            </select>
          </div>
        )}

        <div className="callout-banner callout-banner--info mb-4">
          <span>{t('ads.ifLabel')}</span>
        </div>
        <div className="form-grid-2">
          <div className="mb-4">
            <label htmlFor="ruleMetric" className="form-label-custom">{t('ads.metricLabel')}</label>
            <select id="ruleMetric" className="form-select" value={form.metric} onChange={(event) => update({ metric: event.target.value })}>
              {AD_RULE_METRICS.map((metric) => (
                <option key={metric.key} value={metric.key}>{t(`ads.ruleMetrics.${metric.labelKey}`)}</option>
              ))}
            </select>
          </div>
          <div className="mb-4">
            <label htmlFor="ruleComparator" className="form-label-custom">{t('ads.comparatorLabel')}</label>
            <select id="ruleComparator" className="form-select" value={form.comparator} onChange={(event) => update({ comparator: event.target.value })}>
              {AD_RULE_COMPARATORS.map((comparator) => (
                <option key={comparator.key} value={comparator.key}>{t(`ads.ruleComparators.${comparator.labelKey}`)}</option>
              ))}
            </select>
          </div>
        </div>
        <div className="form-grid-2">
          <TextField
            id="ruleThreshold"
            label={`${t('ads.thresholdLabel')}${metricConfig?.unit === 'currency' ? ' (₹)' : metricConfig?.unit === 'percent' ? ' (%)' : ''}`}
            type="number"
            min="0"
            step="any"
            value={form.threshold}
            onChange={(event) => update({ threshold: event.target.value })}
            required
          />
          <div className="mb-4">
            <label htmlFor="ruleWindow" className="form-label-custom">{t('ads.overTheLast')}</label>
            <select id="ruleWindow" className="form-select" value={form.windowDays} onChange={(event) => update({ windowDays: Number(event.target.value) })}>
              {AD_RULE_WINDOWS.map((days) => (
                <option key={days} value={days}>{days} {t(days === 1 ? 'ads.windowDayOne' : 'ads.windowDayOther')}</option>
              ))}
            </select>
          </div>
        </div>

        <div className="callout-banner callout-banner--info mb-4">
          <span>{t('ads.thenLabel')}</span>
        </div>
        <div className="form-grid-2">
          <div className="mb-4">
            <label htmlFor="ruleAction" className="form-label-custom">{t('ads.actionLabel')}</label>
            <select id="ruleAction" className="form-select" value={form.action} onChange={(event) => update({ action: event.target.value })}>
              {AD_RULE_ACTIONS.map((action) => (
                <option key={action.key} value={action.key}>{t(`ads.ruleActions.${action.labelKey}`)}</option>
              ))}
            </select>
          </div>
          <TextField
            id="ruleCooldown"
            label={t('ads.cooldownLabel')}
            type="number"
            min="1"
            value={form.cooldownHours}
            onChange={(event) => update({ cooldownHours: event.target.value })}
          />
        </div>

        <div className="form-check form-switch mb-0">
          <input className="form-check-input" type="checkbox" role="switch" id="ruleActive" checked={form.isActive} onChange={(event) => update({ isActive: event.target.checked })} />
          <label className="form-check-label" htmlFor="ruleActive">
            {form.isActive ? t('ads.ruleActiveDesc') : t('ads.ruleOffDesc')}
          </label>
        </div>
      </form>
    </Modal>
  );
}

export default RuleFormModal;
