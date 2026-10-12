import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import Modal from '../../components/common/Modal';
import EmptyState from '../../components/common/EmptyState';
import ErrorState from '../../components/common/ErrorState';
import PageLoader from '../../components/common/PageLoader';
import StatusBadge from '../../components/common/StatusBadge';
import CalloutBanner from '../../components/common/CalloutBanner';
import PlatformPicker from '../../components/ai/PlatformPicker';
import { useToast } from '../../components/common/ToastProvider';
import { apiErrorMessage } from '../../services/api/axiosClient';
import * as aiApi from '../../services/api/aiApi';
import { formatShortDate } from '../../utils/billingFormat';
import { formatDate, formatDateTime } from '../../utils/formatters';
import { useI18n } from '../../i18n/useI18n';
import { AI_LANGUAGES, TONES } from './aiOptions';

// Labels: ai.autopilot.contentType.<value> and ai.autopilot.frequency.<value>.
const CONTENT_TYPES = ['mix', 'text', 'image', 'slideshow', 'video'];
const FREQUENCIES = ['daily', 'weekdays', 'weekly'];
/** 0 = Sunday … 6 = Saturday, in the app's language (7 Jan 2024 was a Sunday). */
const weekdayName = (index) => formatDate(new Date(2024, 0, 7 + index), { weekday: 'long' });
const WEEKDAY_INDEXES = [0, 1, 2, 3, 4, 5, 6];

const browserTimeZone = () => Intl.DateTimeFormat().resolvedOptions().timeZone || 'Asia/Kolkata';
const EMPTY = {
  name: '',
  brief: '',
  tone: 'friendly',
  language: 'en',
  platforms: ['facebook'],
  contentType: 'mix',
  useBrandKit: true,
  mode: 'single',
  postsPerDay: 1,
  frequency: 'daily',
  postTime: '10:00',
  weekday: 1,
  requireApproval: true,
  isActive: true,
};

/** Create / edit one autopilot. Rendered only while open, with a `key`, so it always starts fresh. */
function AutopilotFormModal({ autopilot, videoAvailable, onClose, onSaved }) {
  const { t } = useI18n();
  const { showToast } = useToast();
  const [values, setValues] = useState(() => (autopilot ? { ...EMPTY, ...autopilot } : { ...EMPTY, timezone: browserTimeZone() }));
  const [isSaving, setIsSaving] = useState(false);
  const update = (field, value) => setValues((current) => ({ ...current, [field]: value }));

  function handleSubmit(event) {
    event.preventDefault();
    if (!values.name.trim()) return showToast({ type: 'error', title: t('ai.autopilot.nameRequired') });
    if (!values.useBrandKit && values.mode !== 'weekly_plan' && values.brief.trim().length < 5) {
      return showToast({ type: 'error', title: t('ai.autopilot.briefRequired') });
    }
    if (!values.platforms.length) return showToast({ type: 'error', title: t('ai.draft.platformRequired') });
    setIsSaving(true);
    const payload = {
      name: values.name.trim(),
      brief: values.brief.trim(),
      tone: values.tone,
      language: values.language,
      platforms: values.platforms,
      contentType: values.mode === 'weekly_plan' && !['text', 'image', 'mix'].includes(values.contentType) ? 'mix' : values.contentType,
      useBrandKit: values.useBrandKit,
      mode: values.mode,
      postsPerDay: Number(values.postsPerDay),
      frequency: values.mode === 'weekly_plan' ? 'weekly' : values.frequency,
      postTime: values.postTime,
      weekday: Number(values.weekday),
      timezone: values.timezone,
      requireApproval: values.requireApproval,
      isActive: values.isActive,
    };
    const request = autopilot ? aiApi.updateAutopilot(autopilot.id, payload) : aiApi.createAutopilot(payload);
    request
      .then(() => {
        showToast({ type: 'success', title: autopilot ? t('ai.autopilot.saved') : t('ai.autopilot.created') });
        onSaved();
      })
      .catch((error) => showToast({ type: 'error', title: apiErrorMessage(error) }))
      .finally(() => setIsSaving(false));
  }

  const footer = (
    <>
      <button type="button" className="btn btn-outline-secondary-custom" onClick={onClose} disabled={isSaving}>
        {t('common.cancel')}
      </button>
      <button type="submit" form="autopilot-form" className="btn btn-primary" disabled={isSaving}>
        {isSaving ? t('billing.saving') : t('ai.autopilot.save')}
      </button>
    </>
  );

  return (
    <Modal isOpen onClose={onClose} title={autopilot ? t('ai.autopilot.editTitle') : t('ai.autopilot.newTitle')} footer={footer} size="lg">
      <form id="autopilot-form" onSubmit={handleSubmit} className="row g-3">
        <div className="col-12">
          <label className="form-label" htmlFor="ap-name">
            {t('platform.plans.name')}
          </label>
          <input
            id="ap-name"
            className="form-control"
            value={values.name}
            onChange={(event) => update('name', event.target.value)}
            placeholder={t('ai.autopilot.namePlaceholder')}
            maxLength={80}
          />
        </div>
        <div className="col-12">
          <div className="segmented-control" role="group" aria-label={t('ai.autopilot.modeLabel')}>
            <button type="button" className={`segmented-control__item ${values.mode === 'single' ? 'is-active' : ''}`.trim()} onClick={() => update('mode', 'single')}>
              {t('ai.autopilot.modeSingle')}
            </button>
            <button type="button" className={`segmented-control__item ${values.mode === 'weekly_plan' ? 'is-active' : ''}`.trim()} onClick={() => update('mode', 'weekly_plan')}>
              {t('ai.autopilot.modeWeekly')}
            </button>
          </div>
        </div>
        <div className="col-12">
          <div className="form-check form-switch">
            <input id="ap-brandkit" type="checkbox" role="switch" className="form-check-input" checked={values.useBrandKit || values.mode === 'weekly_plan'} disabled={values.mode === 'weekly_plan'} onChange={(event) => update('useBrandKit', event.target.checked)} />
            <label className="form-check-label" htmlFor="ap-brandkit">
              {t('ai.autopilot.useBrandKit')}
            </label>
          </div>
        </div>
        <div className="col-12">
          <label className="form-label" htmlFor="ap-brief">
            {values.useBrandKit || values.mode === 'weekly_plan' ? t('ai.autopilot.extraInstructions') : t('ai.autopilot.briefLabel')}
          </label>
          <textarea
            id="ap-brief"
            className="form-control"
            rows={3}
            value={values.brief}
            onChange={(event) => update('brief', event.target.value)}
            placeholder={t('ai.autopilot.briefPlaceholder')}
            maxLength={2000}
          />
          <div className="form-hint mt-1">{t('ai.autopilot.briefHint')}</div>
        </div>
        <div className="col-12">
          <div className="form-label">{t('ai.platforms')}</div>
          <PlatformPicker value={values.platforms} onChange={(value) => update('platforms', value)} idPrefix="ap" />
        </div>
        <div className="col-sm-6">
          <label className="form-label" htmlFor="ap-type">
            {t('ai.autopilot.whatToPost')}
          </label>
          <select id="ap-type" className="form-select" value={values.contentType} onChange={(event) => update('contentType', event.target.value)}>
            {CONTENT_TYPES.filter((type) => type !== 'video' || videoAvailable).map((type) => (
              <option key={type} value={type}>
                {t(`ai.autopilot.contentType.${type}`)}
              </option>
            ))}
          </select>
        </div>
        <div className="col-sm-3">
          <label className="form-label" htmlFor="ap-tone">
            {t('ai.tone')}
          </label>
          <select id="ap-tone" className="form-select" value={values.tone} onChange={(event) => update('tone', event.target.value)}>
            {TONES.map((tone) => (
              <option key={tone} value={tone}>
                {t(`ai.tones.${tone}`)}
              </option>
            ))}
          </select>
        </div>
        <div className="col-sm-3">
          <label className="form-label" htmlFor="ap-language">
            {t('ai.language')}
          </label>
          <select id="ap-language" className="form-select" value={values.language} onChange={(event) => update('language', event.target.value)}>
            {AI_LANGUAGES.map((language) => (
              <option key={language.code} value={language.code}>
                {language.name}
              </option>
            ))}
          </select>
        </div>
        {values.mode === 'weekly_plan' ? (
          <div className="col-sm-4">
            <label className="form-label" htmlFor="ap-per-day">
              {t('ai.autopilot.postsPerDay')}
            </label>
            <select id="ap-per-day" className="form-select" value={values.postsPerDay} onChange={(event) => update('postsPerDay', Number(event.target.value))}>
              {[1, 2, 3].map((count) => (
                <option key={count} value={count}>
                  {count}
                </option>
              ))}
            </select>
          </div>
        ) : null}
        <div className={values.mode === 'weekly_plan' ? 'd-none' : 'col-sm-4'}>
          <label className="form-label" htmlFor="ap-frequency">
            {t('ai.autopilot.howOften')}
          </label>
          <select id="ap-frequency" className="form-select" value={values.frequency} onChange={(event) => update('frequency', event.target.value)}>
            {FREQUENCIES.map((frequency) => (
              <option key={frequency} value={frequency}>
                {t(`ai.autopilot.frequency.${frequency}`)}
              </option>
            ))}
          </select>
        </div>
        {values.frequency === 'weekly' || values.mode === 'weekly_plan' ? (
          <div className="col-sm-4">
            <label className="form-label" htmlFor="ap-weekday">
              {t('ai.autopilot.day')}
            </label>
            <select id="ap-weekday" className="form-select" value={values.weekday} onChange={(event) => update('weekday', Number(event.target.value))}>
              {WEEKDAY_INDEXES.map((index) => (
                <option key={index} value={index}>
                  {weekdayName(index)}
                </option>
              ))}
            </select>
          </div>
        ) : null}
        <div className="col-sm-4">
          <label className="form-label" htmlFor="ap-time">
            {t('ai.autopilot.time', { timezone: values.timezone })}
          </label>
          <input id="ap-time" type="time" className="form-control" value={values.postTime} onChange={(event) => update('postTime', event.target.value)} />
        </div>
        <div className="col-12">
          <div className="form-check form-switch">
            <input id="ap-approval" type="checkbox" role="switch" className="form-check-input" checked={values.requireApproval} onChange={(event) => update('requireApproval', event.target.checked)} />
            <label className="form-check-label" htmlFor="ap-approval">
              {t('ai.autopilot.requireApproval')}
            </label>
          </div>
          <div className="form-check form-switch">
            <input id="ap-active" type="checkbox" role="switch" className="form-check-input" checked={values.isActive} onChange={(event) => update('isActive', event.target.checked)} />
            <label className="form-check-label" htmlFor="ap-active">
              {t('ai.autopilot.active')}
            </label>
          </div>
        </div>
      </form>
    </Modal>
  );
}

/** "Post about X every day at 10:00" — the AI writes (and designs) each post on schedule. */
function AutopilotTab({ access }) {
  const { t } = useI18n();
  const { showToast } = useToast();
  const [autopilots, setAutopilots] = useState(null);
  const [error, setError] = useState('');
  const [editing, setEditing] = useState(null); // null = closed, {} = new, or an autopilot
  const [runningId, setRunningId] = useState(null);

  const load = useCallback(() => {
    aiApi
      .getAutopilots()
      .then(setAutopilots)
      .catch((loadError) => setError(apiErrorMessage(loadError)));
  }, []);
  useEffect(load, [load]);

  function runNow(autopilot) {
    setRunningId(autopilot.id);
    aiApi
      .runAutopilotNow(autopilot.id)
      .then((result) =>
        showToast({
          type: 'success',
          title: result.queued ? t('ai.autopilot.runQueued') : autopilot.requireApproval ? t('ai.autopilot.runWaiting') : t('ai.autopilot.runPublished'),
        })
      )
      .catch((runError) => showToast({ type: 'error', title: apiErrorMessage(runError) }))
      .finally(() => {
        setRunningId(null);
        load();
      });
  }

  function remove(autopilot) {
    if (!window.confirm(t('ai.autopilot.deleteConfirm', { name: autopilot.name }))) return;
    aiApi
      .deleteAutopilot(autopilot.id)
      .then(load)
      .catch((deleteError) => showToast({ type: 'error', title: apiErrorMessage(deleteError) }));
  }

  if (!access.canManageAutopilots) {
    return <CalloutBanner icon="Lock">{t('ai.autopilot.roleLocked')}</CalloutBanner>;
  }
  if (error) return <ErrorState description={error} />;
  if (!autopilots) return <PageLoader minHeight="16rem" />;

  return (
    <div className="ai-tab">
      <div className="d-flex justify-content-between align-items-center gap-3 flex-wrap">
        <p className="form-hint mb-0">{t('ai.autopilot.intro')}</p>
        <button type="button" className="btn btn-primary" onClick={() => setEditing({})}>
          {t('ai.autopilot.newTitle')}
        </button>
      </div>

      {!autopilots.length ? (
        <EmptyState icon="Bot" title={t('ai.autopilot.emptyTitle')} description={t('ai.autopilot.emptyText')} />
      ) : (
        <div className="data-table-wrapper">
          <table className="data-table data-table--stack">
            <thead>
              <tr>
                <th>{t('ai.tabs.autopilot')}</th>
                <th>{t('ai.autopilot.col.schedule')}</th>
                <th>{t('ai.autopilot.col.nextRun')}</th>
                <th>{t('ai.autopilot.col.lastRun')}</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {autopilots.map((autopilot) => (
                <tr key={autopilot.id}>
                  <td>
                    <div className="table-row-title">{autopilot.name}</div>
                    <div className="table-row-subtitle">
                      {autopilot.mode === 'weekly_plan' ? `${t('ai.autopilot.plansWeek')} · ` : ''}
                      {autopilot.useBrandKit ? `${t('ai.autopilot.brandKitResearch')} · ` : ''}
                      {t(`ai.autopilot.contentType.${autopilot.contentType}`)} · {autopilot.platforms.join(', ')} ·{' '}
                      {autopilot.requireApproval ? t('ai.autopilot.needsApproval') : t('ai.autopilot.publishesAuto')}
                    </div>
                  </td>
                  <td>
                    {t(`ai.autopilot.frequency.${autopilot.frequency}`)}
                    {autopilot.frequency === 'weekly' ? ` (${weekdayName(autopilot.weekday)})` : ''} · {autopilot.postTime}
                  </td>
                  <td>{autopilot.isActive ? formatDateTime(autopilot.nextRunAt) : <StatusBadge status="paused" label={t('ai.autopilot.paused')} />}</td>
                  <td>
                    {autopilot.lastRunAt ? formatShortDate(autopilot.lastRunAt) : '—'}
                    {autopilot.lastError ? <div className="table-row-subtitle text-danger">{autopilot.lastError}</div> : null}
                    {autopilot.lastPostId ? (
                      <div>
                        <Link to={`/posts/${autopilot.lastPostId}/edit`} className="small">
                          {t('ai.autopilot.lastPost')}
                        </Link>
                      </div>
                    ) : null}
                  </td>
                  <td className="text-end text-nowrap">
                    <button type="button" className="btn btn-sm btn-outline-secondary-custom me-2" onClick={() => runNow(autopilot)} disabled={runningId === autopilot.id}>
                      {runningId === autopilot.id ? t('ai.autopilot.running') : t('ai.autopilot.runNow')}
                    </button>
                    <button type="button" className="btn btn-sm btn-outline-secondary-custom me-2" onClick={() => setEditing(autopilot)}>
                      {t('common.edit')}
                    </button>
                    <button type="button" className="btn btn-sm btn-outline-danger" onClick={() => remove(autopilot)}>
                      {t('common.delete')}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {editing ? (
        <AutopilotFormModal
          key={editing.id ?? 'new'}
          autopilot={editing.id ? editing : null}
          videoAvailable={access.videoAvailable}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            load();
          }}
        />
      ) : null}
    </div>
  );
}

export default AutopilotTab;
