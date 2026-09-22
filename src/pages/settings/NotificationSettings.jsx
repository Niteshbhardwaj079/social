import { useEffect, useState } from 'react';
import { useToast } from '../../components/common/ToastProvider';
import { getNotificationPreferences, setNotificationPreferences } from '../../services/api/notificationsApi';
import { apiErrorMessage } from '../../services/api/axiosClient';
import { API_ENABLED } from '../../config/runtime';

const NOTIFICATION_PREFERENCES = [
  { key: 'postPublished', label: 'Post published', description: 'A scheduled post goes live.' },
  { key: 'postFailed', label: 'Post failed', description: 'A post fails to publish.' },
  { key: 'approvalRequested', label: 'Approval requested', description: 'Someone submits content for your review.' },
  { key: 'approvalCompleted', label: 'Approval completed', description: 'Your submitted content is approved or rejected.' },
  { key: 'newMessage', label: 'New message', description: 'A new message arrives in your inbox.' },
  { key: 'newComment', label: 'New comment', description: 'Someone comments on your content.' },
  { key: 'accountDisconnected', label: 'Account disconnected', description: 'A connected account loses access.' },
  { key: 'tokenExpired', label: 'Token expired', description: 'A connected account needs to be reconnected.' },
  { key: 'accountRevoked', label: 'Access revoked', description: 'A platform explicitly revoked a connected account.' },
  { key: 'accountNeedsAttention', label: 'Account needs attention', description: 'A connected account was refused by the platform for another reason.' },
];

function NotificationSettings() {
  const { showToast } = useToast();
  // A key present and set to `false` is off; anything else (including absent, the server's default) is on.
  const [preferences, setPreferences] = useState(
    NOTIFICATION_PREFERENCES.reduce((accumulator, item) => ({ ...accumulator, [item.key]: true }), {})
  );

  useEffect(() => {
    if (!API_ENABLED) return;
    getNotificationPreferences().then((saved) => {
      setPreferences((current) => ({ ...current, ...Object.fromEntries(Object.entries(saved).map(([key, value]) => [key, value !== false])) }));
    });
  }, []);

  function togglePreference(key) {
    const next = !preferences[key];
    setPreferences((current) => ({ ...current, [key]: next }));
    if (!API_ENABLED) {
      showToast({ type: 'info', title: 'Preferences updated' });
      return;
    }
    setNotificationPreferences({ [key]: next }).then(
      () => showToast({ type: 'success', title: 'Preferences updated' }),
      (error) => {
        setPreferences((current) => ({ ...current, [key]: !next }));
        showToast({ type: 'error', title: 'Could not save that', message: apiErrorMessage(error) });
      }
    );
  }

  return (
    <div className="surface-card">
      <h3 className="h5 mb-4">Notification Preferences</h3>
      <div className="d-flex flex-column gap-4">
        {NOTIFICATION_PREFERENCES.map((preference) => (
          <div key={preference.key} className="d-flex justify-content-between align-items-center">
            <div>
              <div className="fw-semibold small">{preference.label}</div>
              <div className="small text-muted-custom">{preference.description}</div>
            </div>
            <div className="form-check form-switch">
              <input
                type="checkbox"
                className="form-check-input"
                role="switch"
                checked={preferences[preference.key]}
                onChange={() => togglePreference(preference.key)}
                aria-label={preference.label}
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export default NotificationSettings;
