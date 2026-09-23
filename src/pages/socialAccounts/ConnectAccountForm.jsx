import { useState } from 'react';
import { Link, Navigate, useNavigate, useParams } from 'react-router-dom';
import Breadcrumb from '../../components/common/Breadcrumb';
import PageHeader from '../../components/common/PageHeader';
import PlatformIcon from '../../components/common/PlatformIcon';
import Icon from '../../components/common/Icon';
import TextField from '../../components/forms/TextField';
import PasswordField from '../../components/forms/PasswordField';
import { getPlatformByKey } from '../../config/platforms';
import { getConnectGuide } from '../../config/platformConnectGuides';
import { getProfileAccess, platformHasPaidTier } from '../../config/platformProfileFields';
import { testAccountConnection, connectAccount } from '../../services/api/socialAccountsApi';
import { apiErrorMessage } from '../../services/api/axiosClient';
import { useToast } from '../../components/common/ToastProvider';

const TEST_STATUS = { IDLE: 'idle', TESTING: 'testing', OK: 'ok', FAILED: 'failed' };

function ConnectAccountForm() {
  const { platformKey } = useParams();
  const navigate = useNavigate();
  const { showToast } = useToast();
  const platform = getPlatformByKey(platformKey);
  const guide = getConnectGuide(platformKey);

  const [values, setValues] = useState({});
  const [apiTier, setApiTier] = useState('free');
  const [testStatus, setTestStatus] = useState(TEST_STATUS.IDLE);
  const [testMessage, setTestMessage] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  if (!platform || !guide) {
    return <Navigate to="/social-accounts/connect" replace />;
  }

  const allFilled = guide.fields.filter((field) => field.required).every((field) => (values[field.key] || '').trim());

  function handleChange(key, value) {
    setValues((current) => ({ ...current, [key]: value }));
    // Any edit invalidates the last test — the saved values must be the tested ones.
    setTestStatus(TEST_STATUS.IDLE);
    setTestMessage('');
  }

  function handleTest() {
    setTestStatus(TEST_STATUS.TESTING);
    testAccountConnection(platformKey, values)
      .then((result) => {
        setTestStatus(result.ok ? TEST_STATUS.OK : TEST_STATUS.FAILED);
        setTestMessage(result.message);
      })
      .catch((error) => {
        setTestStatus(TEST_STATUS.FAILED);
        setTestMessage(apiErrorMessage(error));
      });
  }

  function handleSave(event) {
    event.preventDefault();
    if (testStatus !== TEST_STATUS.OK) return;
    setIsSaving(true);
    connectAccount(platformKey, values, { apiTier })
      .then((account) => {
        showToast({ type: 'success', title: 'Account connected', message: `${account.accountName} is now connected.` });
        navigate('/social-accounts');
      })
      .catch((error) => {
        // The server checks the keys again on save; if they stopped working, say so and ask for a new test.
        setIsSaving(false);
        setTestStatus(TEST_STATUS.FAILED);
        setTestMessage(apiErrorMessage(error));
      });
  }

  const isTesting = testStatus === TEST_STATUS.TESTING;

  return (
    <div className="fade-in">
      <Breadcrumb
        items={[
          { label: 'Social Accounts', to: '/social-accounts' },
          { label: 'Connect account', to: '/social-accounts/connect' },
          { label: platform.label },
        ]}
      />
      <PageHeader
        title={platform.label}
        subtitle="Fill these in, test the connection, then save."
        guideChapterId="social-accounts"
      />

      <section className="connect-guide">
        <div className="connect-guide__head">
          <PlatformIcon platformKey={platform.key} size={40} />
          <h2 className="connect-guide__title">{guide.guideTitle}</h2>
        </div>
        <p className="connect-guide__intro">{guide.intro}</p>
        <ol className="connect-guide__steps">
          {guide.steps.map((step) => (
            <li key={step}>{step}</li>
          ))}
        </ol>
        <a href={guide.providerUrl} target="_blank" rel="noopener noreferrer" className="btn btn-outline-primary-custom">
          <Icon name="ExternalLink" size={16} />
          {guide.providerLabel}
        </a>
      </section>

      <form className="connect-form panel-card" onSubmit={handleSave} noValidate>
        <div className="connect-form__grid">
          {guide.fields.map((field) => {
            const isSecret = field.type === 'password';
            const Field = isSecret ? PasswordField : TextField;
            // PasswordField owns its input type (for the show/hide toggle), so only pass one to TextField.
            const typeProps = isSecret ? {} : { type: field.type };
            return (
              <Field
                key={field.key}
                id={`connect-${field.key}`}
                label={
                  <>
                    {field.label}
                    {field.required ? <span className="text-danger"> *</span> : null}
                  </>
                }
                className={field.wide ? 'connect-form__field--wide' : ''}
                {...typeProps}
                value={values[field.key] || ''}
                onChange={(event) => handleChange(field.key, event.target.value)}
                placeholder={field.placeholder}
                autoComplete="off"
                spellCheck={false}
                hint={field.hint}
              />
            );
          })}
        </div>

        {testStatus === TEST_STATUS.OK || testStatus === TEST_STATUS.FAILED ? (
          <div
            className={`callout-banner callout-banner--${testStatus === TEST_STATUS.OK ? 'success' : 'danger'} mb-4`}
            role="status"
          >
            <Icon name={testStatus === TEST_STATUS.OK ? 'CheckCircle2' : 'AlertCircle'} size={16} />
            <span>{testMessage}</span>
          </div>
        ) : null}

        {platformHasPaidTier(platformKey) ? (
          <fieldset className="api-plan-picker">
            <legend className="form-label-custom">Which plan is this API key on?</legend>
            <div className="api-plan-picker__options">
              {[
                { value: 'free', title: 'Free plan', text: 'Posting and the basics. Fewer profile details show in the Inbox.' },
                {
                  value: 'paid',
                  title: 'Paid plan',
                  text: `Only choose this if you pay for ${getProfileAccess(platformKey).paidPlanName || 'a paid plan'} — Social then also shows followers, bio, location and more.`,
                },
              ].map((option) => (
                <label key={option.value} className={`api-plan-picker__option ${apiTier === option.value ? 'is-selected' : ''}`.trim()}>
                  <input type="radio" name="apiTier" value={option.value} checked={apiTier === option.value} onChange={() => setApiTier(option.value)} />
                  <span>
                    <strong>{option.title}</strong>
                    <span className="api-plan-picker__text">{option.text}</span>
                  </span>
                </label>
              ))}
            </div>
          </fieldset>
        ) : null}

        {testStatus !== TEST_STATUS.OK ? (
          <p className="form-hint text-end">Run “Test connection” first — Save &amp; connect unlocks once it passes.</p>
        ) : null}

        <div className="connect-form__actions">
          <Link to="/social-accounts/connect" className="btn btn-outline-secondary-custom">
            Back
          </Link>
          <button type="button" className="btn btn-outline-primary-custom" onClick={handleTest} disabled={!allFilled || isTesting || isSaving}>
            {isTesting ? (
              <>
                <span className="spinner-border spinner-border-sm" role="status" aria-hidden="true" />
                Testing...
              </>
            ) : (
              <>
                <Icon name="PlugZap" size={16} />
                Test connection
              </>
            )}
          </button>
          <button
            type="submit"
            className="btn btn-primary"
            disabled={testStatus !== TEST_STATUS.OK || isSaving}
          >
            {isSaving ? (
              <>
                <span className="spinner-border spinner-border-sm" role="status" aria-hidden="true" />
                Connecting...
              </>
            ) : (
              'Save & connect'
            )}
          </button>
        </div>
      </form>
    </div>
  );
}

export default ConnectAccountForm;
