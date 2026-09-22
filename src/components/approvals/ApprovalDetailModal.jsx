import { useState } from 'react';
import Modal from '../common/Modal';
import PlatformIcon from '../common/PlatformIcon';
import StatusBadge from '../common/StatusBadge';
import Avatar from '../common/Avatar';
import { formatDateTime } from '../../utils/formatters';

function ApprovalDetailModal({ approval, onClose, onApprove, onReject }) {
  const [rejectionReason, setRejectionReason] = useState('');
  const [isRejecting, setIsRejecting] = useState(false);

  if (!approval) {
    return null;
  }

  const footer = isRejecting ? (
    <>
      <button type="button" className="btn btn-outline-secondary-custom" onClick={() => setIsRejecting(false)}>
        Cancel
      </button>
      <button
        type="button"
        className="btn btn-danger"
        disabled={!rejectionReason.trim()}
        onClick={() => onReject(approval.id, rejectionReason.trim())}
      >
        Confirm Rejection
      </button>
    </>
  ) : (
    <>
      <button type="button" className="btn btn-outline-secondary-custom text-danger" onClick={() => setIsRejecting(true)}>
        Reject
      </button>
      <button type="button" className="btn btn-primary" onClick={() => onApprove(approval.id)}>
        Approve
      </button>
    </>
  );

  return (
    <Modal isOpen={Boolean(approval)} onClose={onClose} title="Review Post" footer={footer} size="lg">
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
        Submitted by {approval.submittedBy} · {formatDateTime(approval.submittedAt)}
      </div>

      <h6 className="mb-3">Comments</h6>
      <div className="d-flex flex-column gap-3 mb-4">
        {approval.comments.length === 0 ? (
          <p className="small text-muted-custom mb-0">No comments yet.</p>
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
            Rejection reason
          </label>
          <textarea
            id="rejectionReason"
            className="form-control"
            rows={3}
            value={rejectionReason}
            onChange={(event) => setRejectionReason(event.target.value)}
            placeholder="Let the author know what needs to change..."
          />
        </div>
      ) : null}
    </Modal>
  );
}

export default ApprovalDetailModal;
