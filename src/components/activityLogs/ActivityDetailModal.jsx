import { useEffect, useState } from 'react';
import Modal from '../common/Modal';
import Avatar from '../common/Avatar';
import { ACTIVITY_ACTION_META } from '../../config/activityLogTypes';

function formatLogTimestamp(isoString) {
  return new Intl.DateTimeFormat('en-US', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  }).format(new Date(isoString));
}

function ActivityDetailModal({ log, onClose }) {
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

  return (
    <Modal isOpen={Boolean(log)} onClose={onClose} title="Activity details" size="md">
      <div className="d-flex align-items-center gap-3 mb-4">
        <Avatar name={log.user} size="sm" />
        <div>
          <div className="fw-semibold">{log.user}</div>
          <div className="small text-muted-custom">{formatLogTimestamp(log.time)}</div>
        </div>
      </div>

      <dl className="activity-detail-list">
        <dt>What they did</dt>
        <dd>
          <strong>{meta?.label}</strong> — {log.target}
        </dd>

        <dt>Section</dt>
        <dd>{log.section}</dd>

        <dt>Details</dt>
        <dd>{log.details}</dd>

        <dt>Device / IP</dt>
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
              Before
            </button>
            <button
              type="button"
              className={`segmented-control__item ${activeView === 'after' ? 'is-active' : ''}`.trim()}
              onClick={() => setActiveView('after')}
            >
              After
            </button>
          </div>
          <div className="activity-diff__box">
            {activeView === 'before' ? log.before || 'No previous value recorded.' : log.after || 'No new value recorded.'}
          </div>
        </div>
      ) : null}
    </Modal>
  );
}

export default ActivityDetailModal;
