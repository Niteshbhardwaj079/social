import { useEffect, useState } from 'react';
import Modal from '../common/Modal';
import PasswordField from '../forms/PasswordField';
import { useI18n } from '../../i18n/useI18n';

/** Re-enter your password before a sensitive security change (disabling 2FA, new backup codes). */
function PasswordConfirmModal({ isOpen, onClose, onConfirm, title, message, confirmLabel, isDanger = false, isSubmitting = false, error }) {
  const { t } = useI18n();
  const [password, setPassword] = useState('');

  useEffect(() => {
    if (isOpen) setPassword('');
  }, [isOpen]);

  function handleSubmit(event) {
    event.preventDefault();
    if (!password) return;
    onConfirm(password);
  }

  const footer = (
    <>
      <button type="button" className="btn btn-outline-secondary-custom" onClick={onClose} disabled={isSubmitting}>
        {t('common.cancel')}
      </button>
      <button type="submit" form="password-confirm-form" className={isDanger ? 'btn btn-danger' : 'btn btn-primary'} disabled={isSubmitting || !password}>
        {isSubmitting ? (
          <>
            <span className="spinner-border spinner-border-sm" role="status" aria-hidden="true" />
            {t('settings.security.pleaseWait')}
          </>
        ) : (
          confirmLabel || t('common.confirm')
        )}
      </button>
    </>
  );

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={title} footer={footer} size="sm">
      <form id="password-confirm-form" onSubmit={handleSubmit}>
        {message ? <p className="text-secondary-custom small mb-3">{message}</p> : null}
        {error ? <p className="text-danger small mb-3">{error}</p> : null}
        <PasswordField
          id="passwordConfirmField"
          label={t('settings.security.passwordConfirmFieldLabel')}
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          autoComplete="current-password"
          autoFocus
        />
      </form>
    </Modal>
  );
}

export default PasswordConfirmModal;
