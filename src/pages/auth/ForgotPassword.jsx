import { useState } from 'react';
import { Link } from 'react-router-dom';
import TextField from '../../components/forms/TextField';
import Icon from '../../components/common/Icon';
import brand from '../../config/brand';
import { API_ENABLED } from '../../config/runtime';
import { apiErrorMessage } from '../../services/api/axiosClient';
import { forgotPasswordRequest } from '../../services/api/authApi';
import { useI18n } from '../../i18n/useI18n';

const REQUEST_SIMULATION_DELAY_MS = 800;

function ForgotPassword() {
  const { t } = useI18n();
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSubmitted, setIsSubmitted] = useState(false);

  function handleSubmit(event) {
    event.preventDefault();

    if (!email) {
      setError(t('auth.emailRequired'));
      return;
    }

    setError('');
    setIsSubmitting(true);
    if (API_ENABLED) {
      // The server answers the same whether or not the email has an account.
      forgotPasswordRequest(email.trim())
        .then(() => setIsSubmitted(true))
        .catch((requestError) => setError(apiErrorMessage(requestError)))
        .finally(() => setIsSubmitting(false));
      return;
    }
    window.setTimeout(() => {
      setIsSubmitting(false);
      setIsSubmitted(true);
    }, REQUEST_SIMULATION_DELAY_MS);
  }

  if (isSubmitted) {
    return (
      <div className="fade-in text-center">
        <div className="empty-state__icon mx-auto">
          <Icon name="MailCheck" size={28} />
        </div>
        <h2 className="mb-2">{t('auth.forgotCheckInboxTitle')}</h2>
        <p className="text-secondary-custom mb-5">
          {t('auth.forgotCheckInboxTextBefore')}<strong>{email}</strong>{t('auth.forgotCheckInboxTextAfter', { supportEmail: brand.supportEmail })}
        </p>
        <Link to="/login" className="btn btn-outline-secondary-custom w-100">
          {t('auth.backToSignIn')}
        </Link>
      </div>
    );
  }

  return (
    <div className="fade-in">
      <h2 className="mb-1">{t('auth.forgot')}</h2>
      <p className="text-secondary-custom mb-5">
        {t('auth.forgotSubtitle')}
      </p>

      <form onSubmit={handleSubmit} noValidate>
        <TextField
          id="email"
          label={t('auth.email')}
          type="email"
          placeholder={t('auth.emailPlaceholder')}
          value={email}
          error={error}
          onChange={(event) => setEmail(event.target.value)}
          autoComplete="email"
        />

        <button type="submit" className="btn btn-primary w-100 btn-lg" disabled={isSubmitting}>
          {isSubmitting ? (
            <>
              <span className="spinner-border spinner-border-sm" role="status" aria-hidden="true" />
              {t('auth.forgotSendingLink')}
            </>
          ) : (
            t('auth.forgotSendButton')
          )}
        </button>
      </form>

      <p className="text-center mt-5 mb-0 small text-secondary-custom">
        {t('auth.forgotRememberedPassword')}{' '}
        <Link to="/login" className="fw-semibold text-decoration-none">
          {t('auth.signIn')}
        </Link>
      </p>
    </div>
  );
}

export default ForgotPassword;
