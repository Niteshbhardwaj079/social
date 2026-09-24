/**
 * Server-side mirror of the web app's `src/config/emailProviders.js` — which fields each provider
 * needs, and which of those are secret. Keep the two in step when a provider's fields change.
 *
 * `smtp` covers any mail server reachable over raw SMTP (Gmail, Outlook, Yahoo, Zoho, iCloud and
 * "Custom" are all this same backend provider — the frontend just pre-fills host/port for the
 * well-known ones). `resend`/`sendgrid`/`brevo` send over a plain HTTPS API instead — no SMTP
 * socket at all, so they work even where outbound SMTP ports are blocked (Render's free tier, for
 * one, blocks 25/465/587 entirely as of 2025-09-26).
 */
const field = (key, { secret = false, required = true } = {}) => ({ key, secret, required });

export const EMAIL_PROVIDERS = {
  smtp: {
    label: 'Custom SMTP server',
    fields: [
      field('host'),
      field('port'),
      field('secure', { required: false }),
      field('username', { required: false }),
      field('password', { secret: true }),
      field('fromEmail'),
      field('fromName', { required: false }),
    ],
  },
  resend: { label: 'Resend', fields: [field('apiKey', { secret: true }), field('fromEmail'), field('fromName', { required: false })] },
  sendgrid: { label: 'SendGrid', fields: [field('apiKey', { secret: true }), field('fromEmail'), field('fromName', { required: false })] },
  brevo: { label: 'Brevo', fields: [field('apiKey', { secret: true }), field('fromEmail'), field('fromName', { required: false })] },
};

export const EMAIL_PROVIDER_KEYS = Object.keys(EMAIL_PROVIDERS);
export const isEmailProvider = (key) => Object.hasOwn(EMAIL_PROVIDERS, key);
