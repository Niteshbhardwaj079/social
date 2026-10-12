import { useState } from 'react';
import Modal from '../common/Modal';
import { useI18n } from '../../i18n/useI18n';

/** Asks why a post is being rejected, so the author knows what to change. `post` is null while closed. */
function RejectPostModal({ post, onClose, onSubmit, isBusy = false }) {
  const { t } = useI18n();
  const [reason, setReason] = useState('');
  const canSubmit = reason.trim().length > 0 && !isBusy;

  function handleClose() {
    setReason('');
    onClose();
  }

  const footer = (
    <>
      <button type="button" className="btn btn-outline-secondary-custom" onClick={handleClose} disabled={isBusy}>
        {t('common.cancel')}
      </button>
      <button type="button" className="btn btn-danger" disabled={!canSubmit} onClick={() => onSubmit(reason.trim())}>
        {isBusy ? t('posts.rejectModal.rejecting') : t('posts.rejectModal.rejectButton')}
      </button>
    </>
  );

  return (
    <Modal isOpen={Boolean(post)} onClose={handleClose} title={t('posts.rejectModal.title')} footer={footer} size="sm">
      <p className="text-secondary-custom">{t('posts.rejectModal.hint')}</p>
      <label className="form-label-custom" htmlFor="rejectReason">
        {t('posts.rejectModal.reasonLabel')}
      </label>
      <textarea
        id="rejectReason"
        className="form-control"
        rows={3}
        maxLength={1000}
        value={reason}
        onChange={(event) => setReason(event.target.value)}
        placeholder={t('posts.rejectModal.reasonPlaceholder')}
      />
    </Modal>
  );
}

export default RejectPostModal;
