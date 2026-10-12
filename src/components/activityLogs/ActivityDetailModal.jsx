import { useEffect, useState } from 'react';
import Modal from '../common/Modal';
import Avatar from '../common/Avatar';
import { ACTIVITY_ACTION_META, ACTIVITY_SECTION_LABEL_KEYS } from '../../config/activityLogTypes';
import { useI18n } from '../../i18n/useI18n';
import { formatDate } from '../../utils/formatters';

function formatLogTimestamp(isoString) {
  return formatDate(isoString, { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' });
}

function ActivityDetailModal({ log, onClose }) {
  const { t } = useI18n();
  const [activeView, setActiveView] = useState('before');

  useEffect(() => {
    if (log) {
      setActiveView(log.before ? 'before' : 'after');
    }
  }, [log]);

  if (!log) {
    return null;
  }

  const meta = ACTIVITY_ACTION_META[log.actionType];
  const hasDiff = Boolean(log.before || log.after);

  const userName = log.user || t('activityLogs.systemUser');
  const detailsText = log.detailsKey ? t(log.detailsKey, log.detailsVars) : log.details;

  return (
    <Modal isOpen={Boolean(log)} onClose={onClose} title={t('activityLogs.detailModalTitle')} size="md">
      <div className="d-flex align-items-center gap-3 mb-4">
        <Avatar name={userName} size="sm" />
        <div>
          <div className="fw-semibold">{userName}</div>
          <div className="small text-muted-custom">{formatLogTimestamp(log.time)}</div>
        </div>
      </div>

      <dl className="activity-detail-list">
        <dt>{t('activityLogs.detailWhatTheyDid')}</dt>
        <dd>
          <strong>{meta?.labelKey ? t(meta.labelKey) : meta?.label}</strong> — {log.target}
        </dd>

        <dt>{t('activityLogs.detailSection')}</dt>
        <dd>{ACTIVITY_SECTION_LABEL_KEYS[log.section] ? t(ACTIVITY_SECTION_LABEL_KEYS[log.section]) : log.section}</dd>

        <dt>{t('activityLogs.detailDetails')}</dt>
        <dd>{detailsText}</dd>

        <dt>{t('activityLogs.detailDeviceIp')}</dt>
        <dd>
          {log.device}
          <br />
          {log.ip}
        </dd>
      </dl>

      {hasDiff ? (
        <div className="activity-diff">
          <div className="segmented-control mb-3">
            <button
              type="button"
              className={`segmented-control__item ${activeView === 'before' ? 'is-active' : ''}`.trim()}
              onClick={() => setActiveView('before')}
            >
              {t('activityLogs.before')}
            </button>
            <button
              type="button"
              className={`segmented-control__item ${activeView === 'after' ? 'is-active' : ''}`.trim()}
              onClick={() => setActiveView('after')}
            >
              {t('activityLogs.after')}
            </button>
          </div>
          <div className="activity-diff__box">
            {activeView === 'before' ? log.before || t('activityLogs.noPreviousValue') : log.after || t('activityLogs.noNewValue')}
          </div>
        </div>
      ) : null}
    </Modal>
  );
}

export default ActivityDetailModal;
