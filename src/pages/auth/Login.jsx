import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useDispatch, useSelector } from 'react-redux';
import TextField from '../../components/forms/TextField';
import PasswordField from '../../components/forms/PasswordField';
import { login, signIn, verifyTwoFactorLogin } from '../../store/slices/authSlice';
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
  // Set once the password step succeeds but the account has 2FA on — switches the form to step 2.
  const [challengeToken, setChallengeToken] = useState(null);
  const [twoFactorCode, setTwoFactorCode] = useState('');
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

  function onSignedIn() {
    showToast({ type: 'success', title: t('auth.welcomeBack'), message: t('auth.signedIn') });
    navigate('/dashboard');
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
        .then((result) => {
          setIsSubmitting(false);
          if (result.requires2fa) {
            setChallengeToken(result.challengeToken);
            return;
          }
          onSignedIn();
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
      onSignedIn();
    }, LOGIN_SIMULATION_DELAY_MS);
  }

  function handleTwoFactorSubmit(event) {
    event.preventDefault();
    if (!twoFactorCode.trim()) return;
    setFormError('');
    setIsSubmitting(true);
    dispatch(verifyTwoFactorLogin({ challengeToken, code: twoFactorCode.trim() }))
      .unwrap()
      .then(onSignedIn)
      .catch((message) => {
        setFormError(message);
        setIsSubmitting(false);
      });
  }

  if (challengeToken) {
    return (
      <div className="fade-in">
        <h2 className="mb-1">Enter your authentication code</h2>
        <p className="text-secondary-custom mb-5">
          Open your authenticator app and enter the 6-digit code, or use one of your backup codes.
        </p>

        {formError ? (
          <CalloutBanner icon="AlertCircle" tone="danger">
            {formError}
          </CalloutBanner>
        ) : null}

        <form onSubmit={handleTwoFactorSubmit} noValidate>
          <TextField
            id="twoFactorCode"
            label="Code"
            placeholder="123456"
            value={twoFactorCode}
            onChange={(event) => setTwoFactorCode(event.target.value)}
            autoComplete="one-time-code"
            autoFocus
          />
          <button type="submit" className="btn btn-primary w-100 btn-lg mb-3" disabled={isSubmitting || !twoFactorCode.trim()}>
            {isSubmitting ? (
              <>
                <span className="spinner-border spinner-border-sm" role="status" aria-hidden="true" />
                Verifying...
              </>
            ) : (
              'Verify'
            )}
          </button>
          <button
            type="button"
            className="btn btn-outline-secondary-custom w-100"
            disabled={isSubmitting}
            onClick={() => {
              setChallengeToken(null);
              setTwoFactorCode('');
              setFormError('');
            }}
          >
            Back to sign in
          </button>
        </form>
      </div>
    );
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
