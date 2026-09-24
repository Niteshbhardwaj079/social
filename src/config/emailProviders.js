/**
 * Providers a client can pick from in Settings → Email.
 *
 *  - `backendKey: 'smtp'` sends over a raw SMTP connection to `host`/`port`. Gmail, Outlook,
 *    Yahoo, Zoho, iCloud and "Custom SMTP server" are all this SAME backend provider — only
 *    host/port/security differ, pre-filled and locked for the well-known ones, left blank and
 *    editable for Custom (`locked: false`).
 *  - `backendKey: 'resend' | 'sendgrid' | 'brevo'` sends over a plain HTTPS API instead — no SMTP
 *    socket at all, so these work even where outbound SMTP ports are blocked (Render's free tier,
 *    for one, blocks ports 25/465/587 entirely as of 2025-09-26 — SMTP alone leaves a free-tier
 *    deployment with no way to send real email regardless of provider or port).
 */
const text = (key, label, extra = {}) => ({ key, label, type: 'text', required: true, ...extra });
const secret = (key, label, extra = {}) => ({ key, label, type: 'password', required: true, secret: true, ...extra });

const SMTP_FIELDS = [
  text('username', 'Username', { required: false, placeholder: 'you@yourcompany.com', hint: 'Leave blank if your server does not need a login.' }),
  secret('password', 'Password'),
  text('fromEmail', 'From email', { type: 'email', placeholder: 'no-reply@yourcompany.com' }),
  text('fromName', 'From name', { required: false, placeholder: 'Your Company' }),
];

const apiKeyFields = (hint) => [secret('apiKey', 'API Key', { hint }), text('fromEmail', 'From email', { type: 'email', placeholder: 'no-reply@yourcompany.com' }), text('fromName', 'From name', { required: false, placeholder: 'Your Company' })];

export const EMAIL_PROVIDERS = [
  {
    key: 'gmail',
    backendKey: 'smtp',
    locked: true,
    label: 'Gmail / Google Workspace',
    summary: 'Send through your Gmail or Google Workspace account.',
    host: 'smtp.gmail.com',
    port: 587,
    secure: false,
    fields: SMTP_FIELDS,
    steps: [
      'Turn on 2-Step Verification on the Google account you want to send from — App Passwords need it.',
      'Go to Google Account → Security → App passwords, and create one for "Mail".',
      'Use the full Gmail address as the username, and the 16-character app password as the password — not your normal Google password.',
    ],
    providerLabel: 'Open Google App Passwords',
    providerUrl: 'https://myaccount.google.com/apppasswords',
  },
  {
    key: 'outlook',
    backendKey: 'smtp',
    locked: true,
    label: 'Outlook / Microsoft 365',
    summary: 'Send through Outlook.com, Hotmail or a Microsoft 365 account.',
    host: 'smtp.office365.com',
    port: 587,
    secure: false,
    fields: SMTP_FIELDS,
    steps: [
      'If 2-Step Verification is on, create an app password under Microsoft Account → Security and use that instead of your normal password.',
      'On a Microsoft 365 work/school account, an admin sometimes needs to turn SMTP AUTH on for your mailbox first — ask them if the connection test fails with an authentication error.',
    ],
    providerLabel: 'Open Microsoft Account Security',
    providerUrl: 'https://account.live.com/proofs/AppPassword',
  },
  {
    key: 'yahoo',
    backendKey: 'smtp',
    locked: true,
    label: 'Yahoo Mail',
    summary: 'Send through your Yahoo Mail account.',
    host: 'smtp.mail.yahoo.com',
    port: 587,
    secure: false,
    fields: SMTP_FIELDS,
    steps: [
      'Go to Yahoo Account Info → Account Security → Generate app password, and create one for "Mail".',
      'Use that app password here, not your normal Yahoo password — Yahoo does not allow the real one for SMTP.',
    ],
    providerLabel: 'Open Yahoo Account Security',
    providerUrl: 'https://login.yahoo.com/account/security',
  },
  {
    key: 'zoho',
    backendKey: 'smtp',
    locked: true,
    label: 'Zoho Mail',
    summary: 'Send through your Zoho Mail account.',
    host: 'smtp.zoho.com',
    port: 587,
    secure: false,
    fields: SMTP_FIELDS,
    steps: [
      'In Zoho Mail, turn on IMAP/SMTP access under Settings → Mail Accounts.',
      'If two-factor authentication is on, create an app-specific password under your Zoho Account → Security and use that instead of your normal password.',
    ],
    caution: 'On the EU or India data center the host is smtp.zoho.eu or smtp.zoho.in instead — check Zoho Mail → Settings → POP/IMAP for your exact host, and choose "Custom SMTP server" below if so.',
    providerLabel: 'Open Zoho Mail Settings',
    providerUrl: 'https://mail.zoho.com/zm/#Settings/mailaccount',
  },
  {
    key: 'icloud',
    backendKey: 'smtp',
    locked: true,
    label: 'iCloud Mail',
    summary: 'Send through your iCloud Mail account.',
    host: 'smtp.mail.me.com',
    port: 587,
    secure: false,
    fields: SMTP_FIELDS,
    steps: [
      'Go to Apple ID → Sign-In and Security → App-Specific Passwords, and generate one.',
      'Use your iCloud email as the username and that app-specific password here — Apple never allows your real Apple ID password for this.',
    ],
    providerLabel: 'Open Apple ID Security',
    providerUrl: 'https://appleid.apple.com/account/manage',
  },
  {
    key: 'resend',
    backendKey: 'resend',
    locked: false,
    label: 'Resend',
    summary: 'Send through your Resend account over its API. Free tier available — and it works even if your host blocks SMTP ports.',
    fields: apiKeyFields('Create one under API Keys in your Resend dashboard.'),
    steps: [
      'Sign up at resend.com and verify a sending domain (or use their shared test domain while trying this out).',
      'Go to API Keys and create one with Sending access.',
    ],
    providerLabel: 'Open Resend API Keys',
    providerUrl: 'https://resend.com/api-keys',
  },
  {
    key: 'sendgrid',
    backendKey: 'sendgrid',
    locked: false,
    label: 'SendGrid',
    summary: 'Send through your SendGrid account over its API. Free tier available — and it works even if your host blocks SMTP ports.',
    fields: apiKeyFields('A Restricted key with Mail Send access, from Settings → API Keys.'),
    steps: [
      'Sign up at sendgrid.com and verify a Sender Identity (a single sender email, or a whole domain).',
      'Go to Settings → API Keys and create a Restricted key with Mail Send access.',
    ],
    providerLabel: 'Open SendGrid API Keys',
    providerUrl: 'https://app.sendgrid.com/settings/api_keys',
  },
  {
    key: 'brevo',
    backendKey: 'brevo',
    locked: false,
    label: 'Brevo',
    summary: 'Send through your Brevo account over its API. Free tier available — and it works even if your host blocks SMTP ports.',
    fields: apiKeyFields('Create one under SMTP & API → API Keys in your Brevo dashboard.'),
    steps: ['Sign up at brevo.com and verify a sender email or domain.', 'Go to SMTP & API → API Keys and generate a new key.'],
    providerLabel: 'Open Brevo API Keys',
    providerUrl: 'https://app.brevo.com/settings/keys/api',
  },
  {
    key: 'customsmtp',
    backendKey: 'smtp',
    locked: false,
    label: 'Custom SMTP server',
    summary: 'Any other SMTP provider (your own mail server, a relay not listed here...) — enter its details yourself.',
    host: '',
    port: 587,
    secure: false,
    fields: SMTP_FIELDS,
  },
];

export function getEmailProvider(key) {
  return EMAIL_PROVIDERS.find((item) => item.key === key) || EMAIL_PROVIDERS[EMAIL_PROVIDERS.length - 1];
}

/** Guesses which UI preset a saved backend connection belongs to, so reopening this page re-selects the right option. */
export function uiKeyForSaved(backendProviderKey, values) {
  if (backendProviderKey !== 'smtp') {
    const match = EMAIL_PROVIDERS.find((item) => item.backendKey === backendProviderKey);
    return match ? match.key : 'customsmtp';
  }
  const match = EMAIL_PROVIDERS.find((item) => item.backendKey === 'smtp' && item.locked && item.host === values?.host);
  return match ? match.key : 'customsmtp';
}
