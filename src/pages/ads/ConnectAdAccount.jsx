import { useEffect, useState } from 'react';
import { Link, Navigate, useNavigate, useParams } from 'react-router-dom';
import Breadcrumb from '../../components/common/Breadcrumb';
import PageHeader from '../../components/common/PageHeader';
import NetworkIcons from '../../components/ads/NetworkIcons';
import Icon from '../../components/common/Icon';
import ConfirmDialog from '../../components/common/ConfirmDialog';
import TextField from '../../components/forms/TextField';
import PasswordField from '../../components/forms/PasswordField';
import { getAdNetwork } from '../../config/adPlatforms';
import { connectAdAccount, disconnectAdAccount, getAdAccounts, testAdAccountConnection } from '../../services/api/adsApi';
import { useToast } from '../../components/common/ToastProvider';

const TEST_STATUS = { IDLE: 'idle', TESTING: 'testing', OK: 'ok', FAILED: 'failed' };

// Same flow as connecting a social account: pick the network, follow the guide,
// paste your own credentials, test, save. Everything runs on the client's own ad account.
function ConnectAdAccount() {
  const { networkKey } = useParams();
  const navigate = useNavigate();
  const { showToast } = useToast();
  const network = getAdNetwork(networkKey);

  const [values, setValues] = useState({});
  const [connectedAccount, setConnectedAccount] = useState(null);
  const [testStatus, setTestStatus] = useState(TEST_STATUS.IDLE);
  const [testMessage, setTestMessage] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [isDisconnectOpen, setIsDisconnectOpen] = useState(false);

  useEffect(() => {
    getAdAccounts().then((accounts) => setConnectedAccount(accounts.find((account) => account.network === networkKey && account.isConnected) || null));
  }, [networkKey]);

  if (!network) return <Navigate to="/ads?tab=accounts" replace />;

  const allFilled = network.fields.filter((field) => field.required).every((field) => (values[field.key] || '').trim());
  const isTesting = testStatus === TEST_STATUS.TESTING;

  function handleChange(key, value) {
    setValues((current) => ({ ...current, [key]: value }));
    setTestStatus(TEST_STATUS.IDLE);
    setTestMessage('');
  }

  function handleTest() {
    setTestStatus(TEST_STATUS.TESTING);
    testAdAccountConnection(networkKey, values).then((result) => {
      setTestStatus(result.ok ? TEST_STATUS.OK : TEST_STATUS.FAILED);
      setTestMessage(result.message);
    });
  }

  function handleSave(event) {
    event.preventDefault();
    if (testStatus !== TEST_STATUS.OK) return;
    setIsSaving(true);
    connectAdAccount(networkKey, values).then(() => {
      showToast({ type: 'success', title: 'Ad account connected', message: `${network.label} is ready for new ads.` });
      navigate('/ads?tab=accounts');
    });
  }

  function handleDisconnectConfirmed() {
    disconnectAdAccount(networkKey).then(() => {
      setIsDisconnectOpen(false);
      showToast({ type: 'info', title: 'Ad account disconnected', message: 'Ads already running keep running on the platform.' });
      navigate('/ads?tab=accounts');
    });
  }

  return (
    <div className="fade-in">
      <Breadcrumb items={[{ label: 'Ads', to: '/ads' }, { label: 'Ad accounts', to: '/ads?tab=accounts' }, { label: network.label }]} />
      <PageHeader
        title={`${network.label} — ${network.subtitle}`}
        subtitle={connectedAccount ? `Connected — account ${connectedAccount.accountId}. Enter new details below to replace them.` : 'Fill these in, test the connection, then save.'}
        guideChapterId="ads"
        actions={
          connectedAccount ? (
            <button type="button" className="btn btn-outline-danger" onClick={() => setIsDisconnectOpen(true)}>
              <Icon name="Unlink" size={16} /> Disconnect
            </button>
          ) : null
        }
      />

      <section className="connect-guide">
        <div className="connect-guide__head">
          <NetworkIcons network={network} size={40} />
          <h2 className="connect-guide__title">{network.guideTitle}</h2>
        </div>
        <p className="connect-guide__intro">{network.intro}</p>
        <ol className="connect-guide__steps">
          {network.steps.map((step) => <li key={step}>{step}</li>)}
        </ol>
        <a href={network.providerUrl} target="_blank" rel="noopener noreferrer" className="btn btn-outline-primary-custom">
          <Icon name="ExternalLink" size={16} />
          {network.providerLabel}
        </a>
      </section>

      <form className="connect-form panel-card" onSubmit={handleSave} noValidate>
        <div className="connect-form__grid">
          {network.fields.map((field) => {
            const isSecret = field.type === 'password';
            const Field = isSecret ? PasswordField : TextField;
            return (
              <Field
                key={field.key}
                id={`ad-${field.key}`}
                label={<>{field.label}{field.required ? <span className="text-danger"> *</span> : null}</>}
                className={field.wide ? 'connect-form__field--wide' : ''}
                {...(isSecret ? {} : { type: field.type })}
                value={values[field.key] || ''}
                onChange={(event) => handleChange(field.key, event.target.value)}
                placeholder={field.placeholder}
                autoComplete="off"
                spellCheck={false}
              />
            );
          })}
        </div>

        {testStatus === TEST_STATUS.OK || testStatus === TEST_STATUS.FAILED ? (
          <div className={`callout-banner callout-banner--${testStatus === TEST_STATUS.OK ? 'success' : 'danger'} mb-4`} role="status">
            <Icon name={testStatus === TEST_STATUS.OK ? 'CheckCircle2' : 'AlertCircle'} size={16} />
            <span>{testMessage}</span>
          </div>
        ) : null}

        {testStatus !== TEST_STATUS.OK ? <p className="form-hint text-end">Run “Test connection” first — Save &amp; connect unlocks once it passes.</p> : null}

        <div className="connect-form__actions">
          <Link to="/ads?tab=accounts" className="btn btn-outline-secondary-custom">Back</Link>
          <button type="button" className="btn btn-outline-primary-custom" onClick={handleTest} disabled={!allFilled || isTesting || isSaving}>
            {isTesting ? <><span className="spinner-border spinner-border-sm" role="status" aria-hidden="true" /> Testing...</> : <><Icon name="PlugZap" size={16} /> Test connection</>}
          </button>
          <button type="submit" className="btn btn-primary" disabled={testStatus !== TEST_STATUS.OK || isSaving}>
            {isSaving ? 'Connecting...' : 'Save & connect'}
          </button>
        </div>
      </form>

      <ConfirmDialog
        isOpen={isDisconnectOpen}
        onClose={() => setIsDisconnectOpen(false)}
        onConfirm={handleDisconnectConfirmed}
        title={`Disconnect ${network.label}?`}
        message="You will not be able to create or edit ads on this account from Social. Ads that are already running keep running on the platform until you stop them there."
        confirmLabel="Disconnect"
        isDanger
      />
    </div>
  );
}

export default ConnectAdAccount;
