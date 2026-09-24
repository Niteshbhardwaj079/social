/**
 * Common email providers a client can pick from — each pre-fills the SMTP host/port/security so
 * most people never have to know what an "SMTP host" even is. "Custom SMTP" covers anything else
 * (a transactional-email API's SMTP relay, a company's own mail server, and so on).
 */
export const EMAIL_PROVIDERS = [
  {
    key: 'gmail',
    label: 'Gmail / Google Workspace',
    summary: 'Send through your Gmail or Google Workspace account.',
    host: 'smtp.gmail.com',
    port: 587,
    secure: false,
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
    label: 'Outlook / Microsoft 365',
    summary: 'Send through Outlook.com, Hotmail or a Microsoft 365 account.',
    host: 'smtp.office365.com',
    port: 587,
    secure: false,
    steps: [
      'If 2-Step Verification is on, create an app password under Microsoft Account → Security and use that instead of your normal password.',
      'On a Microsoft 365 work/school account, an admin sometimes needs to turn SMTP AUTH on for your mailbox first — ask them if the connection test fails with an authentication error.',
    ],
    providerLabel: 'Open Microsoft Account Security',
    providerUrl: 'https://account.live.com/proofs/AppPassword',
  },
  {
    key: 'yahoo',
    label: 'Yahoo Mail',
    summary: 'Send through your Yahoo Mail account.',
    host: 'smtp.mail.yahoo.com',
    port: 587,
    secure: false,
    steps: [
      'Go to Yahoo Account Info → Account Security → Generate app password, and create one for "Mail".',
      'Use that app password here, not your normal Yahoo password — Yahoo does not allow the real one for SMTP.',
    ],
    providerLabel: 'Open Yahoo Account Security',
    providerUrl: 'https://login.yahoo.com/account/security',
  },
  {
    key: 'zoho',
    label: 'Zoho Mail',
    summary: 'Send through your Zoho Mail account.',
    host: 'smtp.zoho.com',
    port: 587,
    secure: false,
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
    label: 'iCloud Mail',
    summary: 'Send through your iCloud Mail account.',
    host: 'smtp.mail.me.com',
    port: 587,
    secure: false,
    steps: [
      'Go to Apple ID → Sign-In and Security → App-Specific Passwords, and generate one.',
      'Use your iCloud email as the username and that app-specific password here — Apple never allows your real Apple ID password for this.',
    ],
    providerLabel: 'Open Apple ID Security',
    providerUrl: 'https://appleid.apple.com/account/manage',
  },
  {
    key: 'custom',
    label: 'Custom SMTP server',
    summary: 'Any other provider (SendGrid, Mailgun, Brevo, your own mail server...) — enter its details yourself.',
    host: '',
    port: 587,
    secure: false,
  },
];

export function getEmailProvider(key) {
  return EMAIL_PROVIDERS.find((item) => item.key === key) || EMAIL_PROVIDERS[EMAIL_PROVIDERS.length - 1];
}

/** Guesses which preset a saved host belongs to, so reopening this page re-selects the right option instead of always falling back to Custom. */
export function providerKeyForHost(host) {
  const match = EMAIL_PROVIDERS.find((item) => item.key !== 'custom' && item.host === host);
  return match ? match.key : 'custom';
}
