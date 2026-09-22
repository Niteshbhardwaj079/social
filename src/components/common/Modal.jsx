import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import Icon from './Icon';
import { useI18n } from '../../i18n/useI18n';

function Modal({ isOpen, onClose, title, children, footer, size = 'md' }) {
  const { t } = useI18n();
  useEffect(() => {
    if (!isOpen) return undefined;

    const handleKeyDown = (event) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    document.body.classList.add('overflow-hidden');

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.body.classList.remove('overflow-hidden');
    };
  }, [isOpen, onClose]);

  if (!isOpen) {
    return null;
  }

  return createPortal(
    <div className="modal d-block" tabIndex="-1" role="dialog">
      <div className="modal-backdrop show" onClick={onClose} />
      <div className={`modal-dialog modal-dialog-centered modal-${size}`} role="document">
        <div className="modal-content">
          <div className="modal-header-custom d-flex align-items-center justify-content-between">
            <h5 className="mb-0">{title}</h5>
            <button
              type="button"
              className="btn btn-icon-sm btn-outline-secondary-custom"
              onClick={onClose}
              aria-label={t('common.close')}
              data-tooltip={t('common.close')}
              data-tooltip-position="bottom"
            >
              <Icon name="X" size={18} />
            </button>
          </div>
          <div className="modal-body-custom">{children}</div>
          {footer ? <div className="modal-footer-custom">{footer}</div> : null}
        </div>
      </div>
    </div>,
    document.body
  );
}

export default Modal;
