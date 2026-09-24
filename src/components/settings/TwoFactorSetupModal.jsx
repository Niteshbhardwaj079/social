import { useEffect, useState } from 'react';
import Modal from '../common/Modal';
import TextField from '../forms/TextField';
import BackupCodesModal from './BackupCodesModal';
import { startTwoFactorSetupRequest, confirmTwoFactorEnableRequest } from '../../services/api/authApi';
import { apiErrorMessage } from '../../services/api/axiosClient';

/** Two steps: scan the QR code and prove you can generate a real code, then save your backup codes. */
function TwoFactorSetupModal({ isOpen, onClose, onEnabled }) {
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
        setError(apiErrorMessage(err, 'Could not start setup.'));
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
        setError(apiErrorMessage(err, 'That code is not correct.'));
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
        intro="Two-factor authentication is now on. Each of these codes can be used once, instead of your authenticator app, if you lose access to it. Save them somewhere safe — they won't be shown again."
      />
    );
  }

  const footer = (
    <>
      <button type="button" className="btn btn-outline-secondary-custom" onClick={onClose} disabled={isSubmitting}>
        Cancel
      </button>
      <button type="submit" form="two-factor-setup-form" className="btn btn-primary" disabled={isSubmitting || !code.trim() || step !== 'scan'}>
        {isSubmitting ? (
          <>
            <span className="spinner-border spinner-border-sm" role="status" aria-hidden="true" />
            Verifying...
          </>
        ) : (
          'Enable'
        )}
      </button>
    </>
  );

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Set up two-factor authentication" footer={footer} size="sm">
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
                Scan this QR code with an authenticator app (Google Authenticator, Authy, 1Password, ...):
              </p>
              <div className="d-flex justify-content-center mb-3">
                <img src={setupData.qrCodeDataUrl} alt="Two-factor authentication QR code" width={200} height={200} />
              </div>
              <p className="text-secondary-custom small mb-1">Can't scan it? Enter this code manually:</p>
              <code className="d-block text-center py-2 mb-3 bg-body-secondary rounded">{setupData.secret}</code>
              <TextField
                id="twoFactorSetupCode"
                label="Enter the 6-digit code from your app"
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
