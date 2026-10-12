import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import PasswordField from '../../components/forms/PasswordField';
import { useToast } from '../../components/common/ToastProvider';
import CalloutBanner from '../../components/common/CalloutBanner';
import { API_ENABLED } from '../../config/runtime';
import { apiErrorMessage } from '../../services/api/axiosClient';
import { resetPasswordRequest } from '../../services/api/authApi';
import { useI18n } from '../../i18n/useI18n';

const RESET_SIMULATION_DELAY_MS = 800;

function ResetPassword() {
  const { t } = useI18n();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token');
  const [formError, setFormError] = useState('');
  const { showToast } = useToast();

  const [formValues, setFormValues] = useState({ password: '', confirmPassword: '' });
  const [formErrors, setFormErrors] = useState({});
  const [isSubmitting, setIsSubmitting] = useState(false);

  function handleChange(field, value) {
    setFormValues((current) => ({ ...current, [field]: value }));
  }

  function validate() {
    const errors = {};
    if (!formValues.password) {
      errors.password = t('auth.passwordRequired');
    } else if (formValues.password.length < 8) {
      errors.password = t('auth.passwordShort');
    }
    if (formValues.confirmPassword !== formValues.password) {
      errors.confirmPassword = t('auth.passwordsDoNotMatch');
    }
    return errors;
  }

  function handleSubmit(event) {
    event.preventDefault();
    const errors = validate();
    setFormErrors(errors);

    if (Object.keys(errors).length > 0) {
      return;
    }

    setFormError('');
    setIsSubmitting(true);
    if (API_ENABLED) {
      resetPasswordRequest({ token, password: formValues.password })
        .then(() => {
          showToast({ type: 'success', title: t('auth.resetPasswordUpdatedToast'), message: t('auth.resetPasswordUpdatedMessage') });
          navigate('/login');
        })
        .catch((requestError) => {
          setFormError(apiErrorMessage(requestError));
          setIsSubmitting(false);
        });
      return;
    }
    window.setTimeout(() => {
      setIsSubmitting(false);
      showToast({ type: 'success', title: t('auth.resetPasswordUpdatedToast'), message: t('auth.resetPasswordUpdatedMessage') });
      navigate('/login');
    }, RESET_SIMULATION_DELAY_MS);
  }

  return (
    <div className="fade-in">
      <h2 className="mb-1">{t('auth.resetTitle')}</h2>
      <p className="text-secondary-custom mb-5">{t('auth.resetSubtitle')}</p>

      {API_ENABLED && !token ? (
        <CalloutBanner icon="AlertCircle" tone="danger">
          {t('auth.resetLinkIncomplete')}
        </CalloutBanner>
      ) : null}
      {formError ? (
        <CalloutBanner icon="AlertCircle" tone="danger">
          {formError}
        </CalloutBanner>
      ) : null}

      <form onSubmit={handleSubmit} noValidate>
        <PasswordField
          id="password"
          label={t('auth.resetNewPasswordLabel')}
          placeholder={t('auth.passwordHint')}
          value={formValues.password}
          error={formErrors.password}
          onChange={(event) => handleChange('password', event.target.value)}
          autoComplete="new-password"
        />
        <PasswordField
          id="confirmPassword"
          label={t('auth.confirmNewPasswordLabel')}
          placeholder={t('auth.reenterPasswordPlaceholder')}
          value={formValues.confirmPassword}
          error={formErrors.confirmPassword}
          onChange={(event) => handleChange('confirmPassword', event.target.value)}
          autoComplete="new-password"
        />

        <button type="submit" className="btn btn-primary w-100 btn-lg" disabled={isSubmitting}>
          {isSubmitting ? (
            <>
              <span className="spinner-border spinner-border-sm" role="status" aria-hidden="true" />
              {t('auth.updatingPasswordEllipsis')}
            </>
          ) : (
            t('auth.resetPasswordButton')
          )}
        </button>
      </form>

      <p className="text-center mt-5 mb-0 small text-secondary-custom">
        <Link to="/login" className="fw-semibold text-decoration-none">
          {t('auth.backToSignIn')}
        </Link>
      </p>
    </div>
  );
}

export default ResetPassword;
