import { config } from '../config/env.js';
import { query } from '../db/pool.js';
import { EMAIL_CATALOG, CATALOG_BY_ID, CATALOG_BY_EVENT } from '../emails/catalog.js';
import { brandVariables, buildDefaultContent, fillTemplate } from '../emails/builder.js';
import { sampleVariables } from '../emails/sampleValues.js';
import { sendEmail, sendEmailInBackground } from './mailer.js';
import { effectiveLanguage } from './settingsService.js';
import { deleteMedia, uploadMedia } from './mediaService.js';
import { badRequest, notFound } from '../utils/httpError.js';
import { logger } from '../utils/logger.js';

const IMAGE_FOLDER = 'System Emails';

const MAX_SUBJECT_LENGTH = 300;
const MAX_HTML_LENGTH = 200_000;

/** Makes sure every email in the catalog has a row (switched on or off as it ships). Safe to run on every start. */
export async function ensureEmailRows() {
  for (const email of EMAIL_CATALOG) {
    await query('INSERT INTO system_emails (id, is_enabled) VALUES ($1, $2) ON CONFLICT (id) DO NOTHING', [email.id, email.defaultEnabled]);
  }
}

function present(email, state, override, language, customisedLanguages, images = []) {
  const defaults = buildDefaultContent(language, email.mailKey);
  return {
    id: email.id,
    mailKey: email.mailKey,
    eventKey: email.eventKey,
    group: email.group,
    whenSent: email.whenSent,
    whoReceives: email.whoReceives,
    variables: email.variables,
    isEnabled: state.is_enabled,
    images,
    language,
    defaultSubject: defaults.subject,
    defaultHtml: defaults.html,
    subject: override ? override.subject : defaults.subject,
    html: override ? override.html : defaults.html,
    customisedLanguages,
  };
}

async function loadState() {
  const ids = EMAIL_CATALOG.map((email) => email.id);
  const [states, overrides, imageRows] = await Promise.all([
    query('SELECT id, is_enabled FROM system_emails'),
    query('SELECT email_id, language, subject, html FROM system_email_translations'),
    query(
      `SELECT sei.email_id, sei.position, m.id, m.public_url, m.width, m.height, m.size_bytes, m.created_at
         FROM system_email_images sei JOIN media_items m ON m.id = sei.media_id
        WHERE sei.email_id = ANY($1) ORDER BY sei.position`,
      [ids]
    ),
  ]);
  const images = new Map(ids.map((id) => [id, []]));
  for (const row of imageRows.rows) {
    images.get(row.email_id).push({ id: row.id, url: row.public_url, width: row.width, height: row.height, sizeBytes: Number(row.size_bytes), uploadedAt: row.created_at });
  }
  return { states: new Map(states.rows.map((row) => [row.id, row])), overrides: overrides.rows, images };
}

/** Every email as one language sees it (its own edited copy if there is one). */
export async function listEmails(language) {
  const { states, overrides, images } = await loadState();
  return EMAIL_CATALOG.map((email) => {
    const mine = overrides.filter((row) => row.email_id === email.id);
    return present(
      email,
      states.get(email.id) || { is_enabled: email.defaultEnabled },
      mine.find((row) => row.language === language),
      language,
      mine.map((row) => row.language).sort(),
      images.get(email.id)
    );
  });
}

export async function getEmail(id, language) {
  if (!CATALOG_BY_ID.has(id)) throw notFound('No such email');
  return (await listEmails(language)).find((email) => email.id === id);
}

// HTML that would run code is rejected: emails never need it, and the preview must stay safe.
const UNSAFE_HTML = /<\s*script|<\s*iframe|<\s*object|<\s*embed|\son\w+\s*=|javascript\s*:/i;

function validateContent({ subject, html }) {
  if (!subject.trim()) throw badRequest('The subject cannot be empty');
  if (/[\r\n]/.test(subject)) throw badRequest('The subject must be a single line');
  if (subject.length > MAX_SUBJECT_LENGTH) throw badRequest(`The subject is too long (${MAX_SUBJECT_LENGTH} characters at most)`);
  if (!html.trim()) throw badRequest('The email HTML cannot be empty');
  if (html.length > MAX_HTML_LENGTH) throw badRequest('The email HTML is too large');
  if (UNSAFE_HTML.test(html)) throw badRequest('Scripts, iframes and event handlers are not allowed in email HTML');
}

/**
 * Saves an edit of ONE language's copy. Editing Hindi never touches Arabic or English.
 * Saving text identical to the built-in wording just removes the override.
 */
export async function saveTranslation(id, language, { subject, html }, actorId) {
  const email = CATALOG_BY_ID.get(id);
  if (!email) throw notFound('No such email');
  validateContent({ subject, html });
  const defaults = buildDefaultContent(language, email.mailKey);
  if (subject === defaults.subject && html === defaults.html) {
    await query('DELETE FROM system_email_translations WHERE email_id = $1 AND language = $2', [id, language]);
  } else {
    await query(
      `INSERT INTO system_email_translations (email_id, language, subject, html, updated_by)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (email_id, language) DO UPDATE
         SET subject = EXCLUDED.subject, html = EXCLUDED.html, updated_by = EXCLUDED.updated_by, updated_at = now()`,
      [id, language, subject, html, actorId]
    );
  }
  return getEmail(id, language);
}

export async function resetTranslation(id, language) {
  if (!CATALOG_BY_ID.has(id)) throw notFound('No such email');
  await query('DELETE FROM system_email_translations WHERE email_id = $1 AND language = $2', [id, language]);
  return getEmail(id, language);
}

export async function setEnabled(id, isEnabled, language) {
  if (!CATALOG_BY_ID.has(id)) throw notFound('No such email');
  await query('UPDATE system_emails SET is_enabled = $2, updated_at = now() WHERE id = $1', [id, isEnabled]);
  return getEmail(id, language);
}

/** Uploads a real file (through the Media Library, so it shares storage and the storage limit) and links it to this email. */
export async function addImage({ id, buffer, contentType, originalName, width, height, actor, ip }) {
  if (!CATALOG_BY_ID.has(id)) throw notFound('No such email');
  const item = await uploadMedia({ buffer, contentType, originalName, type: 'image', folder: IMAGE_FOLDER, width, height, actor, ip });
  const next = (await query('SELECT COALESCE(MAX(position), -1) + 1 AS next FROM system_email_images WHERE email_id = $1', [id])).rows[0].next;
  await query('INSERT INTO system_email_images (email_id, media_id, position) VALUES ($1, $2, $3)', [id, item.id, next]);
  return { id: item.id, url: item.publicUrl, width: item.width, height: item.height, sizeBytes: item.sizeKb * 1024, uploadedAt: item.uploadedAt };
}

/** Removes the image entirely (it is only ever used by this one email) — the same as deleting it from the Media Library. */
export async function removeImage({ id, imageId, actor, ip }) {
  if (!CATALOG_BY_ID.has(id)) throw notFound('No such email');
  const linked = await query('SELECT 1 FROM system_email_images WHERE email_id = $1 AND media_id = $2', [id, imageId]);
  if (!linked.rowCount) throw notFound('No such image on this email');
  await deleteMedia({ id: imageId, actor, ip }); // cascades the system_email_images row too
}

/** The subject and HTML that would go out in this language right now (custom edit or built-in). */
async function resolveContent(email, language) {
  const override = await query('SELECT subject, html FROM system_email_translations WHERE email_id = $1 AND language = $2', [email.id, language]);
  return override.rows[0] || buildDefaultContent(language, email.mailKey);
}

function renderMessage(content, variables) {
  return {
    subject: fillTemplate(content.subject, variables, { html: false }),
    html: fillTemplate(content.html, variables, { html: true }),
  };
}

/** Sends a sample to `recipient` in `language`. Works even while the email is switched off. */
export async function sendTest(id, language, recipient) {
  const email = CATALOG_BY_ID.get(id);
  if (!email) throw notFound('No such email');
  const content = await resolveContent(email, language);
  const variables = { ...sampleVariables(config.appUrl), user_name: recipient.name };
  const { subject, html } = renderMessage(content, variables);
  return sendEmail({ toEmail: recipient.email, toName: recipient.name, language, eventKey: `test:${email.eventKey}`, subject, html });
}

/**
 * Sends the email for a real event (a user is invited, a password changes...) to each recipient
 * in THEIR OWN language — including any edit an admin made in that language. Does nothing when
 * the email is switched off. Never throws: a mail problem must not fail the action behind it.
 *
 * `variables` is an object, or a function of the language for values that must be translated
 * (role names, dates, durations). Returns the languages used per recipient.
 */
export async function dispatchEmail(eventKey, recipients, variables = {}) {
  try {
    const email = CATALOG_BY_EVENT.get(eventKey);
    if (!email) throw new Error(`Unknown email event: ${eventKey}`);
    const state = await query('SELECT is_enabled FROM system_emails WHERE id = $1', [email.id]);
    if (!state.rows[0]?.is_enabled) return [];

    const sent = [];
    for (const recipient of recipients) {
      const language = await effectiveLanguage(recipient.language);
      const content = await resolveContent(email, language);
      const values = typeof variables === 'function' ? variables(language, recipient) : variables;
      const { subject, html } = renderMessage(content, { ...brandVariables(), user_name: recipient.name, ...values });
      await sendEmailInBackground({ toEmail: recipient.email, toName: recipient.name, language, eventKey, subject, html });
      sent.push({ email: recipient.email, language });
    }
    return sent;
  } catch (error) {
    logger.error('Could not dispatch system email', error, { eventKey });
    return [];
  }
}
