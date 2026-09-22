import { query } from '../db/pool.js';
import { LANGUAGES, DEFAULT_LANGUAGE, isValidLanguage } from '../emails/builder.js';

const ALL_CODES = LANGUAGES.map((language) => language.code);

async function getSetting(key) {
  const result = await query('SELECT value FROM settings WHERE key = $1', [key]);
  return result.rows[0]?.value ?? null;
}

async function setSetting(key, value) {
  await query(
    `INSERT INTO settings (key, value) VALUES ($1, $2)
     ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now()`,
    [key, JSON.stringify(value)]
  );
  return value;
}

// ------------------------------------------------------------------ languages
/** Which languages the workspace offers, and which is the default. Always self-consistent. */
export async function getLanguageSettings() {
  const stored = await getSetting('languages');
  const enabled = ALL_CODES.filter((code) => (stored?.enabledLanguages ?? ALL_CODES).includes(code));
  const enabledLanguages = enabled.length ? enabled : ALL_CODES;
  const defaultLanguage = enabledLanguages.includes(stored?.defaultLanguage) ? stored.defaultLanguage : enabledLanguages.includes(DEFAULT_LANGUAGE) ? DEFAULT_LANGUAGE : enabledLanguages[0];
  return { enabledLanguages, defaultLanguage };
}

/** Caller has validated the codes (see routes/settings.js). */
export async function saveLanguageSettings({ enabledLanguages, defaultLanguage }) {
  const enabled = ALL_CODES.filter((code) => enabledLanguages.includes(code));
  await setSetting('languages', { enabledLanguages: enabled, defaultLanguage });
  return getLanguageSettings();
}

/** The language a person is actually served in: their own if the workspace still offers it, else the default. */
export async function effectiveLanguage(code) {
  const { enabledLanguages, defaultLanguage } = await getLanguageSettings();
  return isValidLanguage(code) && enabledLanguages.includes(code) ? code : defaultLanguage;
}

// ------------------------------------------------------------------ workspace details
const WORKSPACE_DEFAULTS = { name: '', website: '', timezone: 'UTC' };

export async function getWorkspace() {
  return { ...WORKSPACE_DEFAULTS, ...(await getSetting('workspace')) };
}

export async function saveWorkspace(values) {
  return setSetting('workspace', { ...(await getWorkspace()), ...values });
}
