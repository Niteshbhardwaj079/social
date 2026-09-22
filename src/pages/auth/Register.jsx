import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useDispatch } from 'react-redux';
import TextField from '../../components/forms/TextField';
import PasswordField from '../../components/forms/PasswordField';
import { login, registerOwner } from '../../store/slices/authSlice';
import { API_ENABLED } from '../../config/runtime';
import CalloutBanner from '../../components/common/CalloutBanner';
import { useToast } from '../../components/common/ToastProvider';
import brand from '../../config/brand';
import { useI18n } from '../../i18n/useI18n';

const REGISTER_SIMULATION_DELAY_MS = 900;

function Register() {
  const { t, language } = useI18n();
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const { showToast } = useToast();

  const [formValues, setFormValues] = useState({
    fullName: '',
    companyName: '',
    email: '',
    password: '',
  });
  const [formErrors, setFormErrors] = useState({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formError, setFormError] = useState('');

  function handleChange(field, value) {
    setFormValues((current) => ({ ...current, [field]: value }));
  }

  function validate() {
    const errors = {};
    if (!formValues.fullName) errors.fullName = t('auth.nameRequired');
    if (!formValues.companyName) errors.companyName = t('auth.companyRequired');
    if (!formValues.email) errors.email = t('auth.emailRequired');
    if (!formValues.password) {
      errors.password = t('auth.passwordRequired');
    } else if (formValues.password.length < 8) {
      errors.password = t('auth.passwordShort');
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
      dispatch(
        registerOwner({
          name: formValues.fullName.trim(),
          email: formValues.email.trim(),
          password: formValues.password,
          companyName: formValues.companyName.trim(),
          language,
        })
      )
        .unwrap()
        .then(() => {
          showToast({ type: 'success', title: t('auth.accountCreated'), message: t('auth.welcomeTo', { product: brand.productName }) });
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
      showToast({ type: 'success', title: t('auth.accountCreated'), message: t('auth.welcomeTo', { product: brand.productName }) });
      navigate('/dashboard');
    }, REGISTER_SIMULATION_DELAY_MS);
  }

  return (
    <div className="fade-in">
      <h2 className="mb-1">{t('auth.createTitle')}</h2>
      <p className="text-secondary-custom mb-5">{t('auth.createText')}</p>

      {formError ? (
        <CalloutBanner icon="AlertCircle" tone="danger">
          {formError}
        </CalloutBanner>
      ) : null}

      <form onSubmit={handleSubmit} noValidate>
        <TextField
          id="fullName"
          label={t('auth.fullName')}
          placeholder="Jane Doe"
          value={formValues.fullName}
          error={formErrors.fullName}
          onChange={(event) => handleChange('fullName', event.target.value)}
          autoComplete="name"
        />
        <TextField
          id="companyName"
          label={t('auth.company')}
          placeholder="Acme Inc."
          value={formValues.companyName}
          error={formErrors.companyName}
          onChange={(event) => handleChange('companyName', event.target.value)}
          autoComplete="organization"
        />
        <TextField
          id="email"
          label={t('auth.workEmail')}
          type="email"
          placeholder="you@company.com"
          value={formValues.email}
          error={formErrors.email}
          onChange={(event) => handleChange('email', event.target.value)}
          autoComplete="email"
        />
        <PasswordField
          id="password"
          label={t('auth.password')}
          placeholder={t('auth.passwordHint')}
          value={formValues.password}
          error={formErrors.password}
          onChange={(event) => handleChange('password', event.target.value)}
          autoComplete="new-password"
        />

        <div className="form-check mb-5">
          <input type="checkbox" className="form-check-input" id="acceptTerms" required />
          <label className="form-check-label small" htmlFor="acceptTerms">
            {t('auth.terms')}
          </label>
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

      <p className="text-center mt-5 mb-0 small text-secondary-custom">
        {t('auth.haveAccount')}{' '}
        <Link to="/login" className="fw-semibold text-decoration-none">
          {t('auth.signIn')}
        </Link>
      </p>
    </div>
  );
}

export default Register;
