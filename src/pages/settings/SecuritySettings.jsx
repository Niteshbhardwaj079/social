import { useState } from 'react';
import Icon from '../../components/common/Icon';
import { useToast } from '../../components/common/ToastProvider';
import { formatDateTime } from '../../utils/formatters';

const ACTIVE_SESSIONS = [
  { id: 'session-1', device: 'Chrome on Windows', location: 'Delhi, India', lastActive: '2026-09-18T06:00:00Z', isCurrent: true },
  { id: 'session-2', device: 'Safari on iPhone', location: 'Delhi, India', lastActive: '2026-09-17T18:20:00Z', isCurrent: false },
];

function SecuritySettings() {
  const { showToast } = useToast();
  const [isTwoFactorEnabled, setIsTwoFactorEnabled] = useState(false);
  const [sessions, setSessions] = useState(ACTIVE_SESSIONS);

  function handleToggleTwoFactor() {
    setIsTwoFactorEnabled((current) => !current);
    showToast({ type: 'success', title: isTwoFactorEnabled ? '2FA disabled' : '2FA enabled' });
  }

  function handleRevokeSession(sessionId) {
    setSessions((current) => current.filter((session) => session.id !== sessionId));
    showToast({ type: 'info', title: 'Session revoked' });
  }

  return (
    <div className="d-flex flex-column gap-5">
      <div className="surface-card">
        <div className="d-flex justify-content-between align-items-center">
          <div>
            <h3 className="h5 mb-1">Two-Factor Authentication</h3>
            <p className="text-secondary-custom small mb-0">Add an extra layer of security to your account.</p>
          </div>
          <div className="form-check form-switch">
            <input
              type="checkbox"
              className="form-check-input"
              role="switch"
              checked={isTwoFactorEnabled}
              onChange={handleToggleTwoFactor}
              aria-label="Two-factor authentication"
            />
          </div>
        </div>
      </div>

      <div className="surface-card">
        <h3 className="h5 mb-4">Active Sessions</h3>
        <div className="d-flex flex-column gap-3">
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
                    {session.location} · {formatDateTime(session.lastActive)}
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
    </div>
  );
}

export default SecuritySettings;
