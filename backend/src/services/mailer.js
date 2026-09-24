import { query } from '../db/pool.js';
import { logger } from '../utils/logger.js';
import { resolveTransport } from './emailSettingsService.js';

/**
 * Sends email through ANY SMTP server the client configures — either in-app under
 * Settings → Email (preferred, see emailSettingsService.js) or via SMTP_HOST/SMTP_USER... env
 * vars as a fallback — so there is no dependency on a paid mail API. Without either, the app
 * still works: messages are recorded in email_outbox as "logged".
 *
 * Every message is written to email_outbox first. If sending fails it is retried a few times
 * in the background, so a mail-server hiccup never loses an email or breaks a request.
 */
const MAX_ATTEMPTS = 5;
const WORKER_INTERVAL_MS = 60_000;

export const mailMode = async () => ((await resolveTransport()) ? 'smtp' : 'log');

/** Stores a message for sending and returns its id. */
export async function queueEmail({ toEmail, toName = null, language, eventKey, subject, html }) {
  const result = await query(
    'INSERT INTO email_outbox (to_email, to_name, language, event_key, subject, html) VALUES ($1, $2, $3, $4, $5, $6) RETURNING id',
    [toEmail, toName, language, eventKey, subject, html]
  );
  return result.rows[0].id;
}

/** One delivery attempt. Never throws; resolves to { status, error }. */
export async function deliver(id) {
  const claimed = await query(
    `UPDATE email_outbox SET attempts = attempts + 1
      WHERE id = $1 AND status IN ('queued', 'failed') AND attempts < $2 RETURNING *`,
    [id, MAX_ATTEMPTS]
  );
  const message = claimed.rows[0];
  if (!message) return { status: 'skipped', error: null };

  const resolved = await resolveTransport();
  if (!resolved) {
    await query("UPDATE email_outbox SET status = 'logged', error = NULL WHERE id = $1", [id]);
    logger.info('Email recorded (no SMTP configured, nothing was sent)', { to: message.to_email, subject: message.subject });
    return { status: 'logged', error: null };
  }

  try {
    await resolved.transport.sendMail({
      from: resolved.mailFrom,
      to: message.to_name ? { name: message.to_name.replace(/["<>\r\n]/g, ''), address: message.to_email } : message.to_email,
      subject: message.subject,
      html: message.html,
    });
    await query("UPDATE email_outbox SET status = 'sent', sent_at = now(), error = NULL WHERE id = $1", [id]);
    return { status: 'sent', error: null };
  } catch (error) {
    const reason = String(error?.message || error).slice(0, 500);
    await query("UPDATE email_outbox SET status = 'failed', error = $2 WHERE id = $1", [id, reason]);
    logger.warn('Email delivery failed', { to: message.to_email, attempt: message.attempts, error: reason });
    return { status: 'failed', error: reason };
  }
}

/** Queue and deliver now, waiting for the outcome (used by "Send test"). */
export async function sendEmail(message) {
  const id = await queueEmail(message);
  return { id, ...(await deliver(id)) };
}

/** Queue now, deliver in the background so the caller never waits on the mail server. */
export async function sendEmailInBackground(message) {
  const id = await queueEmail(message);
  deliver(id).catch((error) => logger.error('Background email delivery crashed', error));
  return id;
}

/** Retries failed or stuck messages, backing off 2 minutes per earlier attempt. Returns a stop function. */
export function startOutboxWorker() {
  const timer = setInterval(async () => {
    try {
      const due = await query(
        `SELECT id FROM email_outbox
          WHERE status IN ('queued', 'failed') AND attempts < $1
            AND created_at + (attempts * interval '2 minutes') < now()
          ORDER BY created_at LIMIT 20`,
        [MAX_ATTEMPTS]
      );
      for (const row of due.rows) await deliver(row.id);
    } catch (error) {
      logger.error('Email worker pass failed', error);
    }
  }, WORKER_INTERVAL_MS);
  timer.unref();
  return () => clearInterval(timer);
}
