import Modal from './Modal';
import { useI18n } from '../../i18n/useI18n';

function ConfirmDialog({
  isOpen,
  onClose,
  onConfirm,
  title,
  message,
  confirmLabel,
  cancelLabel,
  isDanger = false,
}) {
  const { t } = useI18n();
  const footer = (
    <>
      <button type="button" className="btn btn-outline-secondary-custom" onClick={onClose}>
        {cancelLabel ?? t('common.cancel')}
      </button>
      <button
        type="button"
        className={isDanger ? 'btn btn-danger' : 'btn btn-primary'}
        onClick={onConfirm}
      >
        {confirmLabel ?? t('common.confirm')}
      </button>
    </>
  );

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={title ?? t('common.areYouSure')} footer={footer} size="sm">
      <p className="mb-0 text-secondary-custom">{message}</p>
    </Modal>
  );
}

export default ConfirmDialog;
