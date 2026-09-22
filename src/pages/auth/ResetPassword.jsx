import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import PasswordField from '../../components/forms/PasswordField';
import { useToast } from '../../components/common/ToastProvider';
import CalloutBanner from '../../components/common/CalloutBanner';
import { API_ENABLED } from '../../config/runtime';
import { apiErrorMessage } from '../../services/api/axiosClient';
import { resetPasswordRequest } from '../../services/api/authApi';

const RESET_SIMULATION_DELAY_MS = 800;

function ResetPassword() {
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
      errors.password = 'Password is required';
    } else if (formValues.password.length < 8) {
      errors.password = 'Password must be at least 8 characters';
    }
    if (formValues.confirmPassword !== formValues.password) {
      errors.confirmPassword = 'Passwords do not match';
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
          showToast({ type: 'success', title: 'Password updated', message: 'You can now sign in with your new password.' });
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
      showToast({ type: 'success', title: 'Password updated', message: 'You can now sign in with your new password.' });
      navigate('/login');
    }, RESET_SIMULATION_DELAY_MS);
  }

  return (
    <div className="fade-in">
      <h2 className="mb-1">Set a new password</h2>
      <p className="text-secondary-custom mb-5">Choose a strong password you haven&apos;t used before.</p>

      {API_ENABLED && !token ? (
        <CalloutBanner icon="AlertCircle" tone="danger">
          This reset link is incomplete. Open the link from your email again, or request a new one.
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
          label="New password"
          placeholder="At least 8 characters"
          value={formValues.password}
          error={formErrors.password}
          onChange={(event) => handleChange('password', event.target.value)}
          autoComplete="new-password"
        />
        <PasswordField
          id="confirmPassword"
          label="Confirm new password"
          placeholder="Re-enter your password"
          value={formValues.confirmPassword}
          error={formErrors.confirmPassword}
          onChange={(event) => handleChange('confirmPassword', event.target.value)}
          autoComplete="new-password"
        />

        <button type="submit" className="btn btn-primary w-100 btn-lg" disabled={isSubmitting}>
          {isSubmitting ? (
            <>
              <span className="spinner-border spinner-border-sm" role="status" aria-hidden="true" />
              Updating password...
            </>
          ) : (
            'Reset Password'
          )}
        </button>
      </form>

      <p className="text-center mt-5 mb-0 small text-secondary-custom">
        <Link to="/login" className="fw-semibold text-decoration-none">
          Back to Sign In
        </Link>
      </p>
    </div>
  );
}

export default ResetPassword;
