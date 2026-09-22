import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useDispatch, useSelector } from 'react-redux';
import TextField from '../../components/forms/TextField';
import PasswordField from '../../components/forms/PasswordField';
import { login, signIn } from '../../store/slices/authSlice';
import { API_ENABLED } from '../../config/runtime';
import CalloutBanner from '../../components/common/CalloutBanner';
import { useToast } from '../../components/common/ToastProvider';
import { useI18n } from '../../i18n/useI18n';

const LOGIN_SIMULATION_DELAY_MS = 800;

function Login() {
  const { t } = useI18n();
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const { showToast } = useToast();

  const [formValues, setFormValues] = useState({ email: '', password: '' });
  const [formErrors, setFormErrors] = useState({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formError, setFormError] = useState('');
  // With a real server, sign-up exists only until the workspace owner has been created.
  const setupRequired = useSelector((state) => state.auth.setupRequired);
  const showSignUp = !API_ENABLED || setupRequired;

  function handleChange(field, value) {
    setFormValues((current) => ({ ...current, [field]: value }));
  }

  function validate() {
    const errors = {};
    if (!formValues.email) {
      errors.email = t('auth.emailRequired');
    }
    if (!formValues.password) {
      errors.password = t('auth.passwordRequired');
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
      dispatch(signIn({ email: formValues.email.trim(), password: formValues.password }))
        .unwrap()
        .then(() => {
          showToast({ type: 'success', title: t('auth.welcomeBack'), message: t('auth.signedIn') });
          navigate('/dashboard');
        })
        .catch((message) => {
          setFormError(message);
          setIsSubmitting(false);
        });
      return;
    }
    window.setTimeout(() => {
      setIsSubmitting(false);
      dispatch(login());
      showToast({ type: 'success', title: t('auth.welcomeBack'), message: t('auth.signedIn') });
      navigate('/dashboard');
    }, LOGIN_SIMULATION_DELAY_MS);
  }

  return (
    <div className="fade-in">
      <h2 className="mb-1">{t('auth.signIn')}</h2>
      <p className="text-secondary-custom mb-5">{t('auth.signInText')}</p>

      {formError ? (
        <CalloutBanner icon="AlertCircle" tone="danger">
          {formError}
        </CalloutBanner>
      ) : null}

      <form onSubmit={handleSubmit} noValidate>
        <TextField
          id="email"
          label={t('auth.email')}
          type="email"
          placeholder={t('auth.emailPlaceholder')}
          value={formValues.email}
          error={formErrors.email}
          onChange={(event) => handleChange('email', event.target.value)}
          autoComplete="email"
        />

        <PasswordField
          id="password"
          label={t('auth.password')}
          placeholder={t('auth.passwordPlaceholder')}
          value={formValues.password}
          error={formErrors.password}
          onChange={(event) => handleChange('password', event.target.value)}
          autoComplete="current-password"
        />

        <div className="d-flex align-items-center justify-content-between mb-5">
          <div className="form-check">
            <input type="checkbox" className="form-check-input" id="rememberMe" />
            <label className="form-check-label small" htmlFor="rememberMe">
              {t('auth.remember')}
            </label>
          </div>
          <Link to="/forgot-password" className="small fw-semibold text-decoration-none">
            {t('auth.forgot')}
          </Link>
        </div>

        <button type="submit" className="btn btn-primary w-100 btn-lg" disabled={isSubmitting}>
          {isSubmitting ? (
            <>
              <span className="spinner-border spinner-border-sm" role="status" aria-hidden="true" />
              {t('auth.signingIn')}
            </>
          ) : (
            t('auth.signInButton')
          )}
        </button>
      </form>

      {showSignUp ? (
              <p className="text-center mt-5 mb-0 small text-secondary-custom">
          {t('auth.noAccount')}{' '}
          <Link to="/register" className="fw-semibold text-decoration-none">
            {t('auth.createOne')}
          </Link>
        </p>
      ) : null}
    </div>
  );
}

export default Login;
