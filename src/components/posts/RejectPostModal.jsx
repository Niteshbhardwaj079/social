import { useState } from 'react';
import Modal from '../common/Modal';

/** Asks why a post is being rejected, so the author knows what to change. `post` is null while closed. */
function RejectPostModal({ post, onClose, onSubmit, isBusy = false }) {
  const [reason, setReason] = useState('');
  const canSubmit = reason.trim().length > 0 && !isBusy;

  function handleClose() {
    setReason('');
    onClose();
  }

  const footer = (
    <>
      <button type="button" className="btn btn-outline-secondary-custom" onClick={handleClose} disabled={isBusy}>
        Cancel
      </button>
      <button type="button" className="btn btn-danger" disabled={!canSubmit} onClick={() => onSubmit(reason.trim())}>
        {isBusy ? 'Rejecting...' : 'Reject post'}
      </button>
    </>
  );

  return (
    <Modal isOpen={Boolean(post)} onClose={handleClose} title="Reject this post?" footer={footer} size="sm">
      <p className="text-secondary-custom">The author sees your reason and can fix the post and send it again.</p>
      <label className="form-label-custom" htmlFor="rejectReason">
        Reason
      </label>
      <textarea
        id="rejectReason"
        className="form-control"
        rows={3}
        maxLength={1000}
        value={reason}
        onChange={(event) => setReason(event.target.value)}
        placeholder="For example: please add the client logo."
      />
    </Modal>
  );
}

export default RejectPostModal;
