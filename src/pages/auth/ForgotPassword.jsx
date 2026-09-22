import { useState } from 'react';
import { Link } from 'react-router-dom';
import TextField from '../../components/forms/TextField';
import Icon from '../../components/common/Icon';
import brand from '../../config/brand';
import { API_ENABLED } from '../../config/runtime';
import { apiErrorMessage } from '../../services/api/axiosClient';
import { forgotPasswordRequest } from '../../services/api/authApi';

const REQUEST_SIMULATION_DELAY_MS = 800;

function ForgotPassword() {
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSubmitted, setIsSubmitted] = useState(false);

  function handleSubmit(event) {
    event.preventDefault();

    if (!email) {
      setError('Email is required');
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
        <h2 className="mb-2">Check your inbox</h2>
        <p className="text-secondary-custom mb-5">
          We sent password reset instructions to <strong>{email}</strong>. If you don&apos;t see it, check your
          spam folder or contact {brand.supportEmail}.
        </p>
        <Link to="/login" className="btn btn-outline-secondary-custom w-100">
          Back to Sign In
        </Link>
      </div>
    );
  }

  return (
    <div className="fade-in">
      <h2 className="mb-1">Forgot password?</h2>
      <p className="text-secondary-custom mb-5">
        Enter the email associated with your account and we&apos;ll send a link to reset your password.
      </p>

      <form onSubmit={handleSubmit} noValidate>
        <TextField
          id="email"
          label="Email address"
          type="email"
          placeholder="you@company.com"
          value={email}
          error={error}
          onChange={(event) => setEmail(event.target.value)}
          autoComplete="email"
        />

        <button type="submit" className="btn btn-primary w-100 btn-lg" disabled={isSubmitting}>
          {isSubmitting ? (
            <>
              <span className="spinner-border spinner-border-sm" role="status" aria-hidden="true" />
              Sending link...
            </>
          ) : (
            'Send Reset Link'
          )}
        </button>
      </form>

      <p className="text-center mt-5 mb-0 small text-secondary-custom">
        Remembered your password?{' '}
        <Link to="/login" className="fw-semibold text-decoration-none">
          Sign in
        </Link>
      </p>
    </div>
  );
}

export default ForgotPassword;
