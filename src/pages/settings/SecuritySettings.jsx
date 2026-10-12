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
import { useI18n } from '../../i18n/useI18n';

const MOCK_SESSIONS = [
  { id: 'session-1', device: 'Chrome on Windows', location: 'Delhi, India', lastActiveAt: '2026-09-18T06:00:00Z', isCurrent: true },
  { id: 'session-2', device: 'Safari on iPhone', location: 'Delhi, India', lastActiveAt: '2026-09-17T18:20:00Z', isCurrent: false },
];

function SecuritySettings() {
  const { t } = useI18n();
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
      showToast({ type: 'info', title: t('settings.security.sessionRevokedToast') });
      return;
    }
    revokeSessionRequest(sessionId).then(
      () => {
        setSessions((current) => current.filter((session) => session.id !== sessionId));
        showToast({ type: 'info', title: t('settings.security.sessionRevokedToast'), message: t('settings.security.sessionRevokedMessage') });
      },
      (error) => showToast({ type: 'error', title: t('settings.security.couldNotRevokeTitle'), message: apiErrorMessage(error) })
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
          showToast({ type: 'info', title: t('settings.security.twoFactorOffToast') });
        } else {
          setNewBackupCodes(response.backupCodes);
          setPendingAction(null);
        }
      },
      (error) => {
        setIsActionSubmitting(false);
        setActionError(apiErrorMessage(error, t('settings.security.passwordIncorrectDefault')));
      }
    );
  }

  return (
    <div className="d-flex flex-column gap-5">
      <div className="surface-card">
        <div className="d-flex justify-content-between align-items-center">
          <div>
            <h3 className="h5 mb-1">{t('settings.security.twoFactorTitle')}</h3>
            <p className="text-secondary-custom small mb-0">{t('settings.security.twoFactorSubtitle')}</p>
          </div>
          {!API_ENABLED ? (
            <span className="badge bg-secondary-subtle text-secondary-custom">{t('settings.security.needsRealApi')}</span>
          ) : isTwoFactorEnabled ? (
            <span className="badge bg-success-subtle text-success">{t('common.on')}</span>
          ) : (
            <span className="badge bg-secondary-subtle text-secondary-custom">{t('common.off')}</span>
          )}
        </div>
        {API_ENABLED ? (
          <div className="d-flex gap-2 mt-3">
            {isTwoFactorEnabled ? (
              <>
                <button type="button" className="btn btn-sm btn-outline-secondary-custom" onClick={() => setPendingAction('regenerate')}>
                  {t('settings.security.regenerateBackupCodes')}
                </button>
                <button type="button" className="btn btn-sm btn-outline-secondary-custom text-danger" onClick={() => setPendingAction('disable')}>
                  {t('settings.security.turnOff')}
                </button>
              </>
            ) : (
              <button type="button" className="btn btn-sm btn-primary" onClick={() => setIsSetupModalOpen(true)}>
                {t('settings.security.turnOn')}
              </button>
            )}
          </div>
        ) : null}
      </div>

      <div className="surface-card">
        <h3 className="h5 mb-4">{t('settings.security.activeSessionsTitle')}</h3>
        <div className="d-flex flex-column gap-3">
          {sessions.length === 0 ? <p className="text-muted-custom mb-0">{t('settings.security.noOtherSessions')}</p> : null}
          {sessions.map((session) => (
            <div key={session.id} className="d-flex justify-content-between align-items-center">
              <div className="d-flex align-items-center gap-3">
                <span className="session-icon">
                  <Icon name="Monitor" size={18} />
                </span>
                <div>
                  <div className="fw-semibold small">
                    {session.device} {session.isCurrent ? <span className="text-success">{t('settings.security.thisDevice')}</span> : null}
                  </div>
                  <div className="small text-muted-custom">
                    {session.location} · {formatDateTime(session.lastActiveAt)}
                  </div>
                </div>
              </div>
              {!session.isCurrent ? (
                <button type="button" className="btn btn-sm btn-outline-secondary-custom text-danger" onClick={() => handleRevokeSession(session.id)}>
                  {t('settings.security.revoke')}
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
          showToast({ type: 'success', title: t('settings.security.twoFactorEnabledToast') });
        }}
      />

      <PasswordConfirmModal
        isOpen={pendingAction === 'disable'}
        onClose={() => {
          setPendingAction(null);
          setActionError('');
        }}
        onConfirm={handlePasswordConfirmed}
        title={t('settings.security.turnOffConfirmTitle')}
        message={t('settings.security.turnOffConfirmMessage')}
        confirmLabel={t('settings.security.turnOff')}
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
        title={t('settings.security.regenerateConfirmTitle')}
        message={t('settings.security.regenerateConfirmMessage')}
        confirmLabel={t('settings.security.regenerateLabel')}
        isSubmitting={isActionSubmitting}
        error={actionError}
      />

      <BackupCodesModal
        isOpen={Boolean(newBackupCodes)}
        onClose={() => setNewBackupCodes(null)}
        codes={newBackupCodes}
        title={t('settings.security.newBackupCodesTitle')}
        intro={t('settings.security.newBackupCodesIntro')}
      />
    </div>
  );
}

export default SecuritySettings;
