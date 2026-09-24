import Modal from '../common/Modal';
import Icon from '../common/Icon';

/** Shows a freshly generated set of backup codes exactly once — used right after enabling 2FA and
 *  after regenerating codes. There is no way to view existing codes again later; only new ones. */
function BackupCodesModal({ isOpen, onClose, codes, title = 'Save your backup codes', intro }) {
  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={title}
      size="sm"
      footer={
        <button type="button" className="btn btn-primary w-100" onClick={onClose}>
          I've saved these codes
        </button>
      }
    >
      <p className="text-secondary-custom small">
        {intro ||
          "Each of these codes can be used once, instead of your authenticator app, if you lose access to it. Save them somewhere safe — they won't be shown again."}
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
        <Icon name="Copy" size={14} /> Copy all
      </button>
    </Modal>
  );
}

export default BackupCodesModal;
