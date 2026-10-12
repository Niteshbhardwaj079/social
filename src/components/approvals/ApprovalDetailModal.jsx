import { useState } from 'react';
import Modal from '../common/Modal';
import PlatformIcon from '../common/PlatformIcon';
import StatusBadge from '../common/StatusBadge';
import Avatar from '../common/Avatar';
import { formatDateTime } from '../../utils/formatters';
import { useI18n } from '../../i18n/useI18n';

function ApprovalDetailModal({ approval, onClose, onApprove, onReject }) {
  const { t } = useI18n();
  const [rejectionReason, setRejectionReason] = useState('');
  const [isRejecting, setIsRejecting] = useState(false);

  if (!approval) {
    return null;
  }

  const footer = isRejecting ? (
    <>
      <button type="button" className="btn btn-outline-secondary-custom" onClick={() => setIsRejecting(false)}>
        {t('common.cancel')}
      </button>
      <button
        type="button"
        className="btn btn-danger"
        disabled={!rejectionReason.trim()}
        onClick={() => onReject(approval.id, rejectionReason.trim())}
      >
        {t('approvals.detailModal.confirmRejection')}
      </button>
    </>
  ) : (
    <>
      <button type="button" className="btn btn-outline-secondary-custom text-danger" onClick={() => setIsRejecting(true)}>
        {t('posts.reject')}
      </button>
      <button type="button" className="btn btn-primary" onClick={() => onApprove(approval.id)}>
        {t('posts.approve')}
      </button>
    </>
  );

  return (
    <Modal isOpen={Boolean(approval)} onClose={onClose} title={t('approvals.detailModal.title')} footer={footer} size="lg">
      <div className="d-flex align-items-center justify-content-between mb-4">
        <StatusBadge status={approval.status} />
        <div className="d-flex gap-1">
          {approval.platforms.map((platformKey) => (
            <PlatformIcon key={platformKey} platformKey={platformKey} size={26} />
          ))}
        </div>
      </div>

      <p className="mb-4">{approval.postContent}</p>

      <div className="d-flex align-items-center gap-2 mb-5 small text-muted-custom">
        <Avatar name={approval.submittedBy} size="xs" />
        {t('approvals.detailModal.submittedBy', { name: approval.submittedBy, when: formatDateTime(approval.submittedAt) })}
      </div>

      <h6 className="mb-3">{t('approvals.detailModal.commentsTitle')}</h6>
      <div className="d-flex flex-column gap-3 mb-4">
        {approval.comments.length === 0 ? (
          <p className="small text-muted-custom mb-0">{t('approvals.detailModal.noComments')}</p>
        ) : (
          approval.comments.map((comment) => (
            <div key={comment.id} className="d-flex gap-2">
              <Avatar name={comment.author} size="xs" />
              <div>
                <div className="small">
                  <strong>{comment.author}</strong>
                </div>
                <div className="small text-secondary-custom">{comment.text}</div>
              </div>
            </div>
          ))
        )}
      </div>

      {isRejecting ? (
        <div>
          <label htmlFor="rejectionReason" className="form-label-custom">
            {t('approvals.detailModal.rejectionReasonLabel')}
          </label>
          <textarea
            id="rejectionReason"
            className="form-control"
            rows={3}
            value={rejectionReason}
            onChange={(event) => setRejectionReason(event.target.value)}
            placeholder={t('approvals.detailModal.rejectionReasonPlaceholder')}
          />
        </div>
      ) : null}
    </Modal>
  );
}

export default ApprovalDetailModal;
