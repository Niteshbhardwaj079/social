import { useState } from 'react';
import Icon from '../common/Icon';
import { useI18n } from '../../i18n/useI18n';

function PasswordField({ label, id, error, hint, className = '', ...inputProps }) {
  const { t } = useI18n();
  const [isVisible, setIsVisible] = useState(false);

  return (
    <div className={`mb-4 ${className}`.trim()}>
      {label ? (
        <label htmlFor={id} className="form-label-custom">
          {label}
        </label>
      ) : null}
      <div className="position-relative">
        <input
          id={id}
          type={isVisible ? 'text' : 'password'}
          className={`form-control ${error ? 'is-invalid' : ''}`.trim()}
          {...inputProps}
        />
        <button
          type="button"
          className="btn btn-icon-sm bg-transparent border-0 text-secondary-custom position-absolute top-50 end-0 translate-middle-y me-1"
          onClick={() => setIsVisible((value) => !value)}
          aria-label={isVisible ? t('auth.hidePassword') : t('auth.showPassword')}
        >
          <Icon name={isVisible ? 'EyeOff' : 'Eye'} size={16} />
        </button>
      </div>
      {error ? <div className="form-error">{error}</div> : null}
      {!error && hint ? <div className="form-hint">{hint}</div> : null}
    </div>
  );
}

export default PasswordField;
