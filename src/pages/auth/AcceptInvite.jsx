import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useDispatch } from 'react-redux';
import TextField from '../../components/forms/TextField';
import PasswordField from '../../components/forms/PasswordField';
import CalloutBanner from '../../components/common/CalloutBanner';
import { useToast } from '../../components/common/ToastProvider';
import { acceptInvite } from '../../store/slices/authSlice';
import { useI18n } from '../../i18n/useI18n';

/**
 * Where the link in an invitation email lands: the person picks a password, their account
 * becomes active and they are signed in. Only meaningful with a real server (API mode).
 */
function AcceptInvite() {
  const { t } = useI18n();
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const { showToast } = useToast();
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token');

  const [formValues, setFormValues] = useState({ name: '', password: '' });
  const [formErrors, setFormErrors] = useState({});
  const [formError, setFormError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  function handleSubmit(event) {
    event.preventDefault();
    const errors = {};
    if (!formValues.password) errors.password = t('auth.passwordRequired');
    else if (formValues.password.length < 8) errors.password = t('auth.passwordShort');
    setFormErrors(errors);
    if (Object.keys(errors).length > 0) return;

    setFormError('');
    setIsSubmitting(true);
    dispatch(acceptInvite({ token, password: formValues.password, name: formValues.name.trim() || undefined }))
      .unwrap()
      .then(() => {
        showToast({ type: 'success', title: t('auth.welcomeBack'), message: t('auth.signedIn') });
        navigate('/dashboard');
      })
      .catch((message) => {
        setFormError(message);
        setIsSubmitting(false);
      });
  }

  return (
    <div className="fade-in">
      <h2 className="mb-1">{t('auth.acceptTitle')}</h2>
      <p className="text-secondary-custom mb-5">{t('auth.acceptText')}</p>

      {!token ? (
        <CalloutBanner icon="AlertCircle" tone="danger">
          This invitation link is incomplete. Open the link from your email again.
        </CalloutBanner>
      ) : null}
      {formError ? (
        <CalloutBanner icon="AlertCircle" tone="danger">
          {formError}
        </CalloutBanner>
      ) : null}

      <form onSubmit={handleSubmit} noValidate>
        <TextField
          id="name"
          label={t('auth.fullName')}
          value={formValues.name}
          onChange={(event) => setFormValues((current) => ({ ...current, name: event.target.value }))}
          autoComplete="name"
        />
        <PasswordField
          id="password"
          label={t('auth.password')}
          placeholder={t('auth.passwordHint')}
          value={formValues.password}
          error={formErrors.password}
          onChange={(event) => setFormValues((current) => ({ ...current, password: event.target.value }))}
          autoComplete="new-password"
        />
        <button type="submit" className="btn btn-primary w-100 btn-lg" disabled={isSubmitting || !token}>
          {isSubmitting ? (
            <>
              <span className="spinner-border spinner-border-sm" role="status" aria-hidden="true" />
              {t('auth.activating')}
            </>
          ) : (
            t('auth.acceptButton')
          )}
        </button>
      </form>

      <p className="text-center mt-5 mb-0 small text-secondary-custom">
        <Link to="/login" className="fw-semibold text-decoration-none">
          {t('auth.signIn')}
        </Link>
      </p>
    </div>
  );
}

export default AcceptInvite;
