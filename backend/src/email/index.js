import * as smtp from './smtp.js';
import * as resend from './resend.js';
import * as sendgrid from './sendgrid.js';
import * as brevo from './brevo.js';
export { EmailProviderError } from './errors.js';

/**
 * One interface over every way an email can actually leave this app: raw SMTP, or a plain HTTPS
 * API (Resend/SendGrid/Brevo). `provider` is `{ key, values }` — `values` holds every field that
 * provider needs (from emailSettingsService, already decrypted).
 */
const MODULES = { smtp, resend, sendgrid, brevo };

function moduleFor(providerKey) {
  const module = MODULES[providerKey];
  if (!module) throw new Error(`Unknown email provider: ${providerKey}`);
  return module;
}

export const testConnection = (provider) => moduleFor(provider.key).testConnection(provider.values);
export const sendMail = (provider, message) => moduleFor(provider.key).sendMail(provider.values, message);
