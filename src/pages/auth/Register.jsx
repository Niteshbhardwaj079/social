import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useDispatch } from 'react-redux';
import TextField from '../../components/forms/TextField';
import PasswordField from '../../components/forms/PasswordField';
import Icon from '../../components/common/Icon';
import { login, registerOwner } from '../../store/slices/authSlice';
import { API_ENABLED } from '../../config/runtime';
import CalloutBanner from '../../components/common/CalloutBanner';
import { useToast } from '../../components/common/ToastProvider';
import brand from '../../config/brand';
import { useI18n } from '../../i18n/useI18n';

const REGISTER_SIMULATION_DELAY_MS = 900;
const MIN_PASSWORD_LENGTH = 8;
// Digits, spaces, dashes, brackets and an optional leading "+": 7 to 20 characters (same rule as the server).
const PHONE_PATTERN = /^\+?[0-9 ()-]{7,20}$/;

/**
 * Sign-up: a new company creates its organization on the platform and becomes its Super Admin.
 * (The very first person to sign up on a new installation becomes the platform owner.)
 */
function Register() {
  const { t, language } = useI18n();
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const { showToast } = useToast();

  const [formValues, setFormValues] = useState({ companyName: '', fullName: '', email: '', phone: '', password: '', acceptTerms: false });
  const [formErrors, setFormErrors] = useState({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formError, setFormError] = useState('');

  const passwordLongEnough = formValues.password.length >= MIN_PASSWORD_LENGTH;

  function handleChange(field, value) {
    setFormValues((current) => ({ ...current, [field]: value }));
  }

  function validate() {
    const errors = {};
    if (!formValues.companyName.trim()) errors.companyName = t('auth.companyRequired');
    if (!formValues.fullName.trim()) errors.fullName = t('auth.nameRequired');
    if (!formValues.email.trim()) errors.email = t('auth.emailRequired');
    if (!formValues.phone.trim()) errors.phone = t('auth.mobileRequired');
    else if (!PHONE_PATTERN.test(formValues.phone.trim())) errors.phone = t('auth.mobileInvalid');
    if (!formValues.password) errors.password = t('auth.passwordRequired');
    else if (!passwordLongEnough) errors.password = t('auth.passwordShort');
    if (!formValues.acceptTerms) errors.acceptTerms = t('auth.termsRequired');
    return errors;
  }

  function onCreated() {
    showToast({ type: 'success', title: t('auth.accountCreated'), message: t('auth.welcomeTo', { product: brand.productName }) });
    navigate('/dashboard');
  }

  function handleSubmit(event) {
    event.preventDefault();
    const errors = validate();
    setFormErrors(errors);
    if (Object.keys(errors).length > 0) return;

    setFormError('');
    setIsSubmitting(true);
    if (!API_ENABLED) {
      window.setTimeout(() => {
        setIsSubmitting(false);
        dispatch(login());
        onCreated();
      }, REGISTER_SIMULATION_DELAY_MS);
      return;
    }
    dispatch(
      registerOwner({
        name: formValues.fullName.trim(),
        email: formValues.email.trim(),
        password: formValues.password,
        companyName: formValues.companyName.trim(),
        phone: formValues.phone.trim(),
        language,
      })
    )
      .unwrap()
      .then(onCreated)
      .catch((message) => {
        setFormError(message);
        setIsSubmitting(false);
      });
  }

  return (
    <div className="fade-in">
      <h2 className="mb-1">{t('auth.createTitle')}</h2>
      <p className="text-secondary-custom mb-4">{t('auth.setupText', { product: brand.productName })}</p>

      {formError ? (
        <CalloutBanner icon="AlertCircle" tone="danger">
          {formError}
        </CalloutBanner>
      ) : null}

      <form onSubmit={handleSubmit} noValidate>
        <div className="auth-form-grid">
          <TextField
            id="companyName"
            label={t('auth.company')}
            requiredMark
            placeholder={t('auth.companyPlaceholder')}
            value={formValues.companyName}
            error={formErrors.companyName}
            onChange={(event) => handleChange('companyName', event.target.value)}
            autoComplete="organization"
          />
          <TextField
            id="fullName"
            label={t('auth.yourName')}
            requiredMark
            placeholder={t('auth.yourNamePlaceholder')}
            value={formValues.fullName}
            error={formErrors.fullName}
            onChange={(event) => handleChange('fullName', event.target.value)}
            autoComplete="name"
          />
          <TextField
            id="email"
            label={t('auth.workEmail')}
            requiredMark
            type="email"
            placeholder={t('auth.emailPlaceholder')}
            value={formValues.email}
            error={formErrors.email}
            onChange={(event) => handleChange('email', event.target.value)}
            autoComplete="email"
          />
          <TextField
            id="phone"
            label={t('auth.mobile')}
            requiredMark
            type="tel"
            placeholder={t('auth.mobilePlaceholder')}
            value={formValues.phone}
            error={formErrors.phone}
            onChange={(event) => handleChange('phone', event.target.value)}
            autoComplete="tel"
          />
        </div>

        <PasswordField
          id="password"
          label={t('auth.password')}
          requiredMark
          value={formValues.password}
          error={formErrors.password}
          onChange={(event) => handleChange('password', event.target.value)}
          autoComplete="new-password"
        />
        {!formErrors.password ? (
          <ul className="password-rules">
            <li className={passwordLongEnough ? 'is-met' : ''}>
              <Icon name={passwordLongEnough ? 'CheckCircle2' : 'Circle'} size={14} /> {t('auth.passwordHint')}
            </li>
          </ul>
        ) : null}

        <div className="form-check mb-4">
          <input
            type="checkbox"
            className={`form-check-input ${formErrors.acceptTerms ? 'is-invalid' : ''}`.trim()}
            id="acceptTerms"
            checked={formValues.acceptTerms}
            onChange={(event) => handleChange('acceptTerms', event.target.checked)}
          />
          <label className="form-check-label small form-label-custom is-required fw-normal mb-0" htmlFor="acceptTerms">
            {t('auth.agreeBefore')}{' '}
            <a href={`${brand.websiteUrl}/terms`} target="_blank" rel="noreferrer" className="fw-semibold text-decoration-none">
              {t('auth.termsLink')}
            </a>{' '}
            {t('auth.and')}{' '}
            <a href={`${brand.websiteUrl}/privacy`} target="_blank" rel="noreferrer" className="fw-semibold text-decoration-none">
              {t('auth.privacyLink')}
            </a>
          </label>
          {formErrors.acceptTerms ? <div className="form-error">{formErrors.acceptTerms}</div> : null}
        </div>

        <button type="submit" className="btn btn-primary w-100 btn-lg" disabled={isSubmitting}>
          {isSubmitting ? (
            <>
              <span className="spinner-border spinner-border-sm" role="status" aria-hidden="true" />
              {t('auth.creating')}
            </>
          ) : (
            t('auth.createButton')
          )}
        </button>
      </form>

      <p className="text-center mt-4 mb-0 small text-secondary-custom">
        {t('auth.haveAccount')}{' '}
        <Link to="/login" className="fw-semibold text-decoration-none">
          {t('auth.signIn')}
        </Link>
      </p>
    </div>
  );
}

export default Register;
