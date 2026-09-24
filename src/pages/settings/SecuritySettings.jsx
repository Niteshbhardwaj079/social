import { useEffect, useState } from 'react';
import Icon from '../../components/common/Icon';
import { useToast } from '../../components/common/ToastProvider';
import PasswordConfirmModal from '../../components/settings/PasswordConfirmModal';
import TwoFactorSetupModal from '../../components/settings/TwoFactorSetupModal';
import BackupCodesModal from '../../components/settings/BackupCodesModal';
import {
  getSessionsRequest,
  revokeSessionRequest,
  getTwoFactorStatusRequest,
  disableTwoFactorRequest,
  regenerateBackupCodesRequest,
} from '../../services/api/authApi';
import { apiErrorMessage } from '../../services/api/axiosClient';
import { API_ENABLED } from '../../config/runtime';
import { formatDateTime } from '../../utils/formatters';

const MOCK_SESSIONS = [
  { id: 'session-1', device: 'Chrome on Windows', location: 'Delhi, India', lastActiveAt: '2026-09-18T06:00:00Z', isCurrent: true },
  { id: 'session-2', device: 'Safari on iPhone', location: 'Delhi, India', lastActiveAt: '2026-09-17T18:20:00Z', isCurrent: false },
];

function SecuritySettings() {
  const { showToast } = useToast();
  const [sessions, setSessions] = useState(API_ENABLED ? [] : MOCK_SESSIONS);
  const [isTwoFactorEnabled, setIsTwoFactorEnabled] = useState(false);
  const [isSetupModalOpen, setIsSetupModalOpen] = useState(false);
  const [pendingAction, setPendingAction] = useState(null); // 'disable' | 'regenerate' | null
  const [actionError, setActionError] = useState('');
  const [isActionSubmitting, setIsActionSubmitting] = useState(false);
  const [newBackupCodes, setNewBackupCodes] = useState(null);

  useEffect(() => {
    if (!API_ENABLED) return;
    getSessionsRequest().then(setSessions);
    getTwoFactorStatusRequest().then((status) => setIsTwoFactorEnabled(status.enabled));
  }, []);

  function handleRevokeSession(sessionId) {
    if (!API_ENABLED) {
      setSessions((current) => current.filter((session) => session.id !== sessionId));
      showToast({ type: 'info', title: 'Session revoked' });
      return;
    }
    revokeSessionRequest(sessionId).then(
      () => {
        setSessions((current) => current.filter((session) => session.id !== sessionId));
        showToast({ type: 'info', title: 'Session revoked', message: 'That device is signed out.' });
      },
      (error) => showToast({ type: 'error', title: 'Could not revoke that session', message: apiErrorMessage(error) })
    );
  }

  function handlePasswordConfirmed(password) {
    setIsActionSubmitting(true);
    setActionError('');
    const request = pendingAction === 'disable' ? disableTwoFactorRequest(password) : regenerateBackupCodesRequest(password);
    request.then(
      (response) => {
        setIsActionSubmitting(false);
        if (pendingAction === 'disable') {
          setIsTwoFactorEnabled(false);
          setPendingAction(null);
          showToast({ type: 'info', title: 'Two-factor authentication turned off' });
        } else {
          setNewBackupCodes(response.backupCodes);
          setPendingAction(null);
        }
      },
      (error) => {
        setIsActionSubmitting(false);
        setActionError(apiErrorMessage(error, 'Your password is not correct.'));
      }
    );
  }

  return (
    <div className="d-flex flex-column gap-5">
      <div className="surface-card">
        <div className="d-flex justify-content-between align-items-center">
          <div>
            <h3 className="h5 mb-1">Two-Factor Authentication</h3>
            <p className="text-secondary-custom small mb-0">Add an extra layer of security to your account with an authenticator app.</p>
          </div>
          {!API_ENABLED ? (
            <span className="badge bg-secondary-subtle text-secondary-custom">Needs the real API</span>
          ) : isTwoFactorEnabled ? (
            <span className="badge bg-success-subtle text-success">On</span>
          ) : (
            <span className="badge bg-secondary-subtle text-secondary-custom">Off</span>
          )}
        </div>
        {API_ENABLED ? (
          <div className="d-flex gap-2 mt-3">
            {isTwoFactorEnabled ? (
              <>
                <button type="button" className="btn btn-sm btn-outline-secondary-custom" onClick={() => setPendingAction('regenerate')}>
                  Regenerate backup codes
                </button>
                <button type="button" className="btn btn-sm btn-outline-secondary-custom text-danger" onClick={() => setPendingAction('disable')}>
                  Turn off
                </button>
              </>
            ) : (
              <button type="button" className="btn btn-sm btn-primary" onClick={() => setIsSetupModalOpen(true)}>
                Turn on
              </button>
            )}
          </div>
        ) : null}
      </div>

      <div className="surface-card">
        <h3 className="h5 mb-4">Active Sessions</h3>
        <div className="d-flex flex-column gap-3">
          {sessions.length === 0 ? <p className="text-muted-custom mb-0">No other active sessions.</p> : null}
          {sessions.map((session) => (
            <div key={session.id} className="d-flex justify-content-between align-items-center">
              <div className="d-flex align-items-center gap-3">
                <span className="session-icon">
                  <Icon name="Monitor" size={18} />
                </span>
                <div>
                  <div className="fw-semibold small">
                    {session.device} {session.isCurrent ? <span className="text-success">(This device)</span> : null}
                  </div>
                  <div className="small text-muted-custom">
                    {session.location} · {formatDateTime(session.lastActiveAt)}
                  </div>
                </div>
              </div>
              {!session.isCurrent ? (
                <button type="button" className="btn btn-sm btn-outline-secondary-custom text-danger" onClick={() => handleRevokeSession(session.id)}>
                  Revoke
                </button>
              ) : null}
            </div>
          ))}
        </div>
      </div>

      <TwoFactorSetupModal
        isOpen={isSetupModalOpen}
        onClose={() => setIsSetupModalOpen(false)}
        onEnabled={() => {
          setIsTwoFactorEnabled(true);
          showToast({ type: 'success', title: 'Two-factor authentication is on' });
        }}
      />

      <PasswordConfirmModal
        isOpen={pendingAction === 'disable'}
        onClose={() => {
          setPendingAction(null);
          setActionError('');
        }}
        onConfirm={handlePasswordConfirmed}
        title="Turn off two-factor authentication?"
        message="Enter your password to confirm. Your backup codes will stop working."
        confirmLabel="Turn off"
        isDanger
        isSubmitting={isActionSubmitting}
        error={actionError}
      />

      <PasswordConfirmModal
        isOpen={pendingAction === 'regenerate'}
        onClose={() => {
          setPendingAction(null);
          setActionError('');
        }}
        onConfirm={handlePasswordConfirmed}
        title="Regenerate backup codes?"
        message="Enter your password to confirm. Your existing backup codes will stop working."
        confirmLabel="Regenerate"
        isSubmitting={isActionSubmitting}
        error={actionError}
      />

      <BackupCodesModal
        isOpen={Boolean(newBackupCodes)}
        onClose={() => setNewBackupCodes(null)}
        codes={newBackupCodes}
        title="Your new backup codes"
        intro="Your old backup codes no longer work. Save these somewhere safe — they won't be shown again."
      />
    </div>
  );
}

export default SecuritySettings;
