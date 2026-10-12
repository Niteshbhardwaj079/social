import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import Icon from '../common/Icon';
import StatusBadge from '../common/StatusBadge';
import PlatformPicker from './PlatformPicker';
import { useToast } from '../common/ToastProvider';
import { apiErrorMessage } from '../../services/api/axiosClient';
import { createContentPlan, getContentPlans } from '../../services/api/aiApi';
import { formatShortDate } from '../../utils/billingFormat';
import { useI18n } from '../../i18n/useI18n';

const POLL_EVERY_MS = 5000;
// The label of each status is ai.plan.status.<status>.
const STATUS_BADGE = { queued: 'pendingApproval', running: 'pendingApproval', succeeded: 'published', failed: 'failed' };
const browserTimeZone = () => Intl.DateTimeFormat().resolvedOptions().timeZone || 'Asia/Kolkata';

/**
 * "Plan my week": the agent prepares several days of posts in one go, each scheduled at the chosen
 * time. With approval on they wait in Approvals; approving one schedules it.
 */
function WeeklyPlanPanel() {
  const { t } = useI18n();
  const { showToast } = useToast();
  const [form, setForm] = useState({ days: 7, postsPerDay: 1, platforms: ['facebook', 'instagram'], format: 'mix', postTime: '10:00', requireApproval: true });
  const [plans, setPlans] = useState([]);
  const [isStarting, setIsStarting] = useState(false);
  const update = (field, value) => setForm((current) => ({ ...current, [field]: value }));

  const load = useCallback(() => {
    getContentPlans()
      .then(setPlans)
      .catch(() => {});
  }, []);
  useEffect(load, [load]);

  // Refresh while a plan is still being prepared.
  const busy = plans.some((plan) => plan.status === 'queued' || plan.status === 'running');
  useEffect(() => {
    if (!busy) return undefined;
    const timer = window.setInterval(load, POLL_EVERY_MS);
    return () => window.clearInterval(timer);
  }, [busy, load]);

  function handleSubmit(event) {
    event.preventDefault();
    if (!form.platforms.length) return showToast({ type: 'error', title: t('ai.draft.platformRequired') });
    setIsStarting(true);
    createContentPlan({ ...form, timezone: browserTimeZone() })
      .then(() => {
        showToast({ type: 'success', title: t('ai.plan.startedTitle'), message: t('ai.plan.startedText') });
        load();
      })
      .catch((error) => showToast({ type: 'error', title: apiErrorMessage(error) }))
      .finally(() => setIsStarting(false));
  }

  return (
    <section className="surface-card">
      <h3 className="h5 mb-1">{t('ai.plan.title')}</h3>
      <p className="form-hint">{t('ai.plan.intro')}</p>
      <form onSubmit={handleSubmit}>
        <div className="form-label">{t('ai.platforms')}</div>
        <PlatformPicker value={form.platforms} onChange={(value) => update('platforms', value)} idPrefix="plan" />
        <div className="row g-3 mt-1">
          <div className="col-sm-6 col-lg-3">
            <label className="form-label" htmlFor="plan-days">
              {t('ai.plan.days')}
            </label>
            <select id="plan-days" className="form-select" value={form.days} onChange={(event) => update('days', Number(event.target.value))}>
              {[3, 5, 7, 14].map((days) => (
                <option key={days} value={days}>
                  {t('ai.plan.nextDays', { days })}
                </option>
              ))}
            </select>
          </div>
          <div className="col-sm-6 col-lg-3">
            <label className="form-label" htmlFor="plan-per-day">
              {t('ai.autopilot.postsPerDay')}
            </label>
            <select id="plan-per-day" className="form-select" value={form.postsPerDay} onChange={(event) => update('postsPerDay', Number(event.target.value))}>
              {[1, 2, 3].map((count) => (
                <option key={count} value={count}>
                  {count}
                </option>
              ))}
            </select>
          </div>
          <div className="col-sm-6 col-lg-3">
            <label className="form-label" htmlFor="plan-format">
              {t('ai.plan.postsWith')}
            </label>
            <select id="plan-format" className="form-select" value={form.format} onChange={(event) => update('format', event.target.value)}>
              <option value="mix">{t('ai.plan.formatMix')}</option>
              <option value="image">{t('ai.plan.formatImage')}</option>
              <option value="text">{t('ai.plan.formatText')}</option>
            </select>
          </div>
          <div className="col-sm-6 col-lg-3">
            <label className="form-label" htmlFor="plan-time">
              {t('ai.plan.firstPostAt')}
            </label>
            <input id="plan-time" type="time" className="form-control" value={form.postTime} onChange={(event) => update('postTime', event.target.value)} />
          </div>
        </div>
        <div className="d-flex justify-content-between align-items-center mt-3 gap-3 flex-wrap">
          <div className="form-check form-switch mb-0">
            <input id="plan-approval" type="checkbox" role="switch" className="form-check-input" checked={form.requireApproval} onChange={(event) => update('requireApproval', event.target.checked)} />
            <label className="form-check-label" htmlFor="plan-approval">
              {t('ai.plan.requireApproval')}
            </label>
          </div>
          <button type="submit" className="btn btn-primary d-inline-flex align-items-center gap-2" disabled={isStarting}>
            <Icon name="CalendarDays" size={16} /> {isStarting ? t('ai.video.starting') : t('ai.plan.submit')}
          </button>
        </div>
      </form>

      {plans.length ? (
        <ul className="org-list mt-4">
          {plans.slice(0, 5).map((plan) => (
            <li key={plan.id}>
              <span>
                {formatShortDate(plan.createdAt)} ·{' '}
                {t('ai.plan.summary', { days: plan.options.days, perDay: plan.options.postsPerDay, posts: plan.postIds.length })}
                {plan.autopilotId ? ` · ${t('ai.tabs.autopilot')}` : ''}
                {plan.error ? <div className="form-hint text-danger">{plan.error}</div> : null}
              </span>
              <span className="d-flex align-items-center gap-2">
                <StatusBadge status={STATUS_BADGE[plan.status] ?? 'draft'} label={t(`ai.plan.status.${plan.status}`)} />
                {plan.status === 'succeeded' && plan.options.requireApproval ? (
                  <Link to="/approvals" className="small fw-semibold">
                    {t('ai.plan.review')}
                  </Link>
                ) : null}
              </span>
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}

export default WeeklyPlanPanel;
