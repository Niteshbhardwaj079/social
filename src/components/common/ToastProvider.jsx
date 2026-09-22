import { createContext, useCallback, useContext, useMemo, useState } from 'react';
import Icon from './Icon';

const ToastContext = createContext(null);

const TOAST_ICON_BY_TYPE = {
  success: 'CheckCircle2',
  error: 'XCircle',
  info: 'Info',
};

const TOAST_AUTO_DISMISS_MS = 4500;

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);

  const dismissToast = useCallback((id) => {
    setToasts((current) => current.filter((toast) => toast.id !== id));
  }, []);

  const showToast = useCallback(
    ({ type = 'info', title, message }) => {
      const id = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
      setToasts((current) => [...current, { id, type, title, message }]);
      window.setTimeout(() => dismissToast(id), TOAST_AUTO_DISMISS_MS);
    },
    [dismissToast]
  );

  const contextValue = useMemo(() => ({ showToast }), [showToast]);

  return (
    <ToastContext.Provider value={contextValue}>
      {children}
      <div className="toast-stack">
        {toasts.map((toast) => (
          <div key={toast.id} className={`toast-item toast-item--${toast.type}`}>
            <span className="toast-item__icon">
              <Icon name={TOAST_ICON_BY_TYPE[toast.type]} size={18} />
            </span>
            <div>
              {toast.title ? <div className="toast-item__title">{toast.title}</div> : null}
              {toast.message ? <div className="toast-item__message">{toast.message}</div> : null}
            </div>
            <button
              type="button"
              className="toast-item__close"
              onClick={() => dismissToast(toast.id)}
              aria-label="Dismiss notification"
            >
              <Icon name="X" size={16} />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error('useToast must be used within a ToastProvider');
  }
  return context;
}
