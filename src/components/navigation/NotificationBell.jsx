import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import Icon from '../common/Icon';
import DropdownMenu from '../common/DropdownMenu';
import { getNotifications, markAllNotificationsAsRead, markNotificationAsRead } from '../../services/api/notificationsApi';
import { NOTIFICATION_TYPE_META } from '../../config/notificationTypes';
import { formatRelativeTime } from '../../utils/formatters';
import { useToast } from '../common/ToastProvider';
import { useI18n } from '../../i18n/useI18n';

function NotificationBell() {
  const { t } = useI18n();
  const { showToast } = useToast();
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);

  useEffect(() => {
    getNotifications().then(({ items, unreadCount: count }) => {
      setNotifications(items);
      setUnreadCount(count);
    });
  }, []);

  function handleMarkAllRead() {
    markAllNotificationsAsRead().then(() => {
      setNotifications((current) => current.map((notification) => ({ ...notification, isRead: true })));
      setUnreadCount(0);
      showToast({ type: 'success', title: t('top.allRead') });
    });
  }

  function handleOpenNotification(notification) {
    if (notification.isRead) return;
    markNotificationAsRead(notification.id).then(() => {
      setNotifications((current) => current.map((item) => (item.id === notification.id ? { ...item, isRead: true } : item)));
      setUnreadCount((current) => Math.max(0, current - 1));
    });
  }

  return (
    <DropdownMenu
      trigger={
        <button
          type="button"
          className="topbar-icon-btn"
          aria-label={t('top.notifications')}
          data-tooltip={t('top.notifications')}
          data-tooltip-position="bottom"
        >
          <Icon name="Bell" size={20} />
          {unreadCount > 0 ? <span className="topbar-icon-btn__badge">{unreadCount > 9 ? '9+' : unreadCount}</span> : null}
        </button>
      }
      className="p-0"
    >
      <div className="notification-panel">
        <div className="d-flex align-items-center justify-content-between px-4 py-3 border-bottom">
          <span className="fw-semibold">{t('top.notifications')}</span>
          {unreadCount > 0 ? (
            <button type="button" className="btn btn-sm btn-link p-0" onClick={handleMarkAllRead}>
              {t('top.markAllRead')}
            </button>
          ) : null}
        </div>
        <div className="notification-panel__list">
          {notifications.length === 0 ? (
            <div className="p-4 text-center text-muted-custom">{t('top.noNotifications')}</div>
          ) : (
            notifications.map((notification) => {
              const meta = NOTIFICATION_TYPE_META[notification.type];
              return (
                <button
                  key={notification.id}
                  type="button"
                  className="notification-row"
                  onClick={() => handleOpenNotification(notification)}
                >
                  <span className={`icon-badge icon-badge--${meta?.accent || 'slate'}`}>
                    <Icon name={meta?.icon || 'Bell'} size={16} />
                  </span>
                  <div className="notification-row__body">
                    <div className="notification-row__title">
                      {notification.title}
                      {!notification.isRead ? <span className="notification-row__unread-dot" /> : null}
                    </div>
                    <div className="notification-row__message">{notification.message}</div>
                    <div className="notification-row__time">{formatRelativeTime(notification.time)}</div>
                  </div>
                </button>
              );
            })
          )}
        </div>
        <div className="text-center py-3 border-top">
          <Link to="/activity-logs" className="small fw-semibold">
            {t('top.viewAll')}
          </Link>
        </div>
      </div>
    </DropdownMenu>
  );
}

export default NotificationBell;
