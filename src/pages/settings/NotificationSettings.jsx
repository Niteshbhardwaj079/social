import { useEffect, useState } from 'react';
import { useToast } from '../../components/common/ToastProvider';
import { getNotificationPreferences, setNotificationPreferences } from '../../services/api/notificationsApi';
import { apiErrorMessage } from '../../services/api/axiosClient';
import { API_ENABLED } from '../../config/runtime';
import { useI18n } from '../../i18n/useI18n';

const NOTIFICATION_PREFERENCE_KEYS = [
  'postPublished',
  'postFailed',
  'approvalRequested',
  'approvalCompleted',
  'newMessage',
  'newComment',
  'accountDisconnected',
  'tokenExpired',
  'accountRevoked',
  'accountNeedsAttention',
  'billingUpdate',
  'aiAgentUpdate',
];

function NotificationSettings() {
  const { t } = useI18n();
  const { showToast } = useToast();
  // A key present and set to `false` is off; anything else (including absent, the server's default) is on.
  const [preferences, setPreferences] = useState(
    NOTIFICATION_PREFERENCE_KEYS.reduce((accumulator, key) => ({ ...accumulator, [key]: true }), {})
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
      showToast({ type: 'info', title: t('settings.notifications.updatedToast') });
      return;
    }
    setNotificationPreferences({ [key]: next }).then(
      () => showToast({ type: 'success', title: t('settings.notifications.updatedToast') }),
      (error) => {
        setPreferences((current) => ({ ...current, [key]: !next }));
        showToast({ type: 'error', title: t('settings.notifications.couldNotSaveTitle'), message: apiErrorMessage(error) });
      }
    );
  }

  return (
    <div className="surface-card">
      <h3 className="h5 mb-4">{t('settings.notifications.title')}</h3>
      <div className="d-flex flex-column gap-4">
        {NOTIFICATION_PREFERENCE_KEYS.map((key) => (
          <div key={key} className="d-flex justify-content-between align-items-center">
            <div>
              <div className="fw-semibold small">{t(`settings.notifications.prefs.${key}.label`)}</div>
              <div className="small text-muted-custom">{t(`settings.notifications.prefs.${key}.description`)}</div>
            </div>
            <div className="form-check form-switch">
              <input
                type="checkbox"
                className="form-check-input"
                role="switch"
                checked={preferences[key]}
                onChange={() => togglePreference(key)}
                aria-label={t(`settings.notifications.prefs.${key}.label`)}
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export default NotificationSettings;
