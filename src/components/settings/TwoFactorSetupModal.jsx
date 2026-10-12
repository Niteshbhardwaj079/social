import { useEffect, useState } from 'react';
import Modal from '../common/Modal';
import TextField from '../forms/TextField';
import BackupCodesModal from './BackupCodesModal';
import { startTwoFactorSetupRequest, confirmTwoFactorEnableRequest } from '../../services/api/authApi';
import { apiErrorMessage } from '../../services/api/axiosClient';
import { useI18n } from '../../i18n/useI18n';

/** Two steps: scan the QR code and prove you can generate a real code, then save your backup codes. */
function TwoFactorSetupModal({ isOpen, onClose, onEnabled }) {
  const { t } = useI18n();
  const [step, setStep] = useState('loading'); // loading | scan | codes
  const [setupData, setSetupData] = useState(null);
  const [code, setCode] = useState('');
  const [backupCodes, setBackupCodes] = useState([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!isOpen) return;
    setStep('loading');
    setCode('');
    setError('');
    startTwoFactorSetupRequest().then(
      (data) => {
        setSetupData(data);
        setStep('scan');
      },
      (err) => {
        setError(apiErrorMessage(err, t('settings.security.couldNotStartSetup')));
        setStep('scan');
      }
    );
  }, [isOpen]);

  function handleConfirm(event) {
    event.preventDefault();
    if (!code.trim()) return;
    setIsSubmitting(true);
    setError('');
    confirmTwoFactorEnableRequest(code.trim()).then(
      (data) => {
        setIsSubmitting(false);
        setBackupCodes(data.backupCodes);
        setStep('codes');
      },
      (err) => {
        setIsSubmitting(false);
        setError(apiErrorMessage(err, t('settings.security.codeIncorrect')));
      }
    );
  }

  function handleDone() {
    onEnabled();
    onClose();
  }

  if (step === 'codes') {
    return (
      <BackupCodesModal
        isOpen={isOpen}
        onClose={handleDone}
        codes={backupCodes}
        intro={t('settings.security.enableAuthAppCodesIntro')}
      />
    );
  }

  const footer = (
    <>
      <button type="button" className="btn btn-outline-secondary-custom" onClick={onClose} disabled={isSubmitting}>
        {t('common.cancel')}
      </button>
      <button type="submit" form="two-factor-setup-form" className="btn btn-primary" disabled={isSubmitting || !code.trim() || step !== 'scan'}>
        {isSubmitting ? (
          <>
            <span className="spinner-border spinner-border-sm" role="status" aria-hidden="true" />
            {t('settings.security.verifyingEllipsis')}
          </>
        ) : (
          t('common.enable')
        )}
      </button>
    </>
  );

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={t('settings.security.setupTitle')} footer={footer} size="sm">
      {step === 'loading' ? (
        <div className="d-flex justify-content-center py-4">
          <span className="spinner-border" role="status" aria-hidden="true" />
        </div>
      ) : (
        <form id="two-factor-setup-form" onSubmit={handleConfirm}>
          {error ? <p className="text-danger small mb-3">{error}</p> : null}
          {setupData ? (
            <>
              <p className="text-secondary-custom small">
                {t('settings.security.scanQrInstruction')}
              </p>
              <div className="d-flex justify-content-center mb-3">
                <img src={setupData.qrCodeDataUrl} alt={t('settings.security.qrAlt')} width={200} height={200} />
              </div>
              <p className="text-secondary-custom small mb-1">{t('settings.security.cantScanPrompt')}</p>
              <code className="d-block text-center py-2 mb-3 bg-body-secondary rounded">{setupData.secret}</code>
              <TextField
                id="twoFactorSetupCode"
                label={t('settings.security.enterCodeLabel')}
                placeholder="123456"
                value={code}
                onChange={(event) => setCode(event.target.value)}
                autoComplete="one-time-code"
                autoFocus
              />
            </>
          ) : null}
        </form>
      )}
    </Modal>
  );
}

export default TwoFactorSetupModal;
