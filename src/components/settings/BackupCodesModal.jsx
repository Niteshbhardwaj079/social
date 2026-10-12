import Modal from '../common/Modal';
import Icon from '../common/Icon';
import { useI18n } from '../../i18n/useI18n';

/** Shows a freshly generated set of backup codes exactly once — used right after enabling 2FA and
 *  after regenerating codes. There is no way to view existing codes again later; only new ones. */
function BackupCodesModal({ isOpen, onClose, codes, title, intro }) {
  const { t } = useI18n();
  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={title || t('settings.security.defaultBackupCodesTitle')}
      size="sm"
      footer={
        <button type="button" className="btn btn-primary w-100" onClick={onClose}>
          {t('settings.security.savedCodesButton')}
        </button>
      }
    >
      <p className="text-secondary-custom small">
        {intro || t('settings.security.defaultBackupCodesIntro')}
      </p>
      <div className="row row-cols-2 g-2 mb-3">
        {(codes || []).map((backupCode) => (
          <div key={backupCode} className="col">
            <code className="d-block text-center py-2 bg-body-secondary rounded">{backupCode}</code>
          </div>
        ))}
      </div>
      <button
        type="button"
        className="btn btn-outline-secondary-custom btn-sm w-100"
        onClick={() => navigator.clipboard?.writeText((codes || []).join('\n')).catch(() => {})}
      >
        <Icon name="Copy" size={14} /> {t('settings.security.copyAll')}
      </button>
    </Modal>
  );
}

export default BackupCodesModal;
