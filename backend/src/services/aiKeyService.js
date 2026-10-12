import { query, runAsSystem } from '../db/pool.js';
import { AI_PROVIDER_KEYS, PREFERRED_ORDER, getAiProvider, listAiProviders } from '../ai/providers/index.js';
import { AiProviderError } from '../ai/http.js';
import { getPlatformSettings } from './platformSettingsService.js';
import { decryptJson, encryptJson } from '../utils/crypto.js';
import { badRequest } from '../utils/httpError.js';

/**
 * AI API keys, from two places:
 *   - the organization's OWN key per provider (Settings → AI) — they pay the provider, no credits used;
 *   - the platform owner's key per provider (Platform → AI) — we pay, so each use costs plan credits.
 * Keys are stored encrypted and never sent back to the browser (only "••••abcd").
 */

const hintOf = (apiKey) => `••••${String(apiKey).slice(-4)}`;

function assertProvider(providerKey) {
  if (!AI_PROVIDER_KEYS.includes(providerKey)) throw badRequest('Unknown AI provider.');
  // Ollama is an address on a server, not a key: only the platform owner sets it (Platform → AI → Ollama),
  // so no customer can make our server call an address of their choosing.
  if (providerKey === 'ollama') throw badRequest('Ollama is set up by the platform owner under Platform → AI.');
  return getAiProvider(providerKey);
}

/** Checks the key with the provider itself before saving it — a typo is caught now, not at 2 a.m. in an autopilot. */
async function verifyKey(providerKey, apiKey) {
  const provider = assertProvider(providerKey);
  const cleaned = String(apiKey ?? '').trim();
  if (cleaned.length < 10) throw badRequest('That API key looks too short.');
  try {
    await provider.testKey(cleaned);
  } catch (error) {
    if (error instanceof AiProviderError) throw badRequest(error.message);
    throw error;
  }
  return cleaned;
}

// ---------------------------------------------------------------- the organization's own keys
export async function listOrganizationKeys() {
  const rows = (await query('SELECT provider, secret_hint, connected_at FROM ai_provider_keys')).rows;
  return rows.map((row) => ({ provider: row.provider, hint: row.secret_hint, connectedAt: row.connected_at }));
}

export async function saveOrganizationKey(providerKey, apiKey) {
  const cleaned = await verifyKey(providerKey, apiKey);
  await query(
    `INSERT INTO ai_provider_keys (provider, credentials, secret_hint) VALUES ($1, $2, $3)
     ON CONFLICT (organization_id, provider) DO UPDATE SET credentials = EXCLUDED.credentials, secret_hint = EXCLUDED.secret_hint, connected_at = now()`,
    [providerKey, encryptJson({ apiKey: cleaned }), hintOf(cleaned)]
  );
  return listOrganizationKeys();
}

export async function removeOrganizationKey(providerKey) {
  assertProvider(providerKey);
  await query('DELETE FROM ai_provider_keys WHERE provider = $1', [providerKey]);
  return listOrganizationKeys();
}

// ---------------------------------------------------------------- the platform owner's keys
export async function listPlatformKeys() {
  const rows = (await runAsSystem(() => query('SELECT provider, secret_hint, updated_at FROM platform_ai_keys'))).rows;
  return rows.map((row) => ({ provider: row.provider, hint: row.secret_hint, connectedAt: row.updated_at }));
}

export async function savePlatformKey(providerKey, apiKey) {
  const cleaned = await verifyKey(providerKey, apiKey);
  await runAsSystem(() =>
    query(
      `INSERT INTO platform_ai_keys (provider, credentials, secret_hint) VALUES ($1, $2, $3)
       ON CONFLICT (provider) DO UPDATE SET credentials = EXCLUDED.credentials, secret_hint = EXCLUDED.secret_hint, updated_at = now()`,
      [providerKey, encryptJson({ apiKey: cleaned }), hintOf(cleaned)]
    )
  );
  return listPlatformKeys();
}

export async function removePlatformKey(providerKey) {
  assertProvider(providerKey);
  await runAsSystem(() => query('DELETE FROM platform_ai_keys WHERE provider = $1', [providerKey]));
  return listPlatformKeys();
}

// ---------------------------------------------------------------- the organization's choices
export async function getAiSettingsRow() {
  // The row is created with the organization; an older organization without one just gets the defaults.
  return (await query('SELECT * FROM ai_settings')).rows[0] ?? { text_provider: null, image_provider: null, video_provider: null, brand_voice: '' };
}

export async function saveAiSettings({ textProvider = null, imageProvider = null, videoProvider = null, brandVoice = '' }) {
  for (const [kind, providerKey] of [['text', textProvider], ['image', imageProvider], ['video', videoProvider]]) {
    if (providerKey && !getAiProvider(providerKey)?.capabilities[kind]) throw badRequest(`That provider cannot make ${kind}.`);
  }
  await query(
    `INSERT INTO ai_settings (text_provider, image_provider, video_provider, brand_voice) VALUES ($1, $2, $3, $4)
     ON CONFLICT (organization_id) DO UPDATE SET text_provider = EXCLUDED.text_provider, image_provider = EXCLUDED.image_provider,
       video_provider = EXCLUDED.video_provider, brand_voice = EXCLUDED.brand_voice, updated_at = now()`,
    [textProvider, imageProvider, videoProvider, brandVoice]
  );
  return getAiSettingsRow();
}

// ---------------------------------------------------------------- which key does this job use?
async function decryptedKeys(rows) {
  const keys = new Map();
  for (const row of rows) {
    try {
      keys.set(row.provider, decryptJson(row.credentials).apiKey);
    } catch {
      // A key saved under an old ENCRYPTION_KEY cannot be read any more: treat it as not connected.
    }
  }
  return keys;
}

/**
 * Picks the provider, key and model for a job (`kind` = 'text' | 'image' | 'video'):
 *   1. the provider the organization chose for this kind, if any — else the first capable one in PREFERRED_ORDER
 *      that has a key (the organization's own first, then the platform's);
 *   2. the organization's own key for it, else the platform's key (which then costs credits).
 * Returns { provider, apiKey, model, usesPlatformKey } or throws a clear "connect a key" message.
 */
export async function resolveAiProvider(kind) {
  const [settings, platformSettings, ownRows, platformRows] = await Promise.all([
    getAiSettingsRow(),
    getPlatformSettings(),
    query('SELECT provider, credentials FROM ai_provider_keys'),
    runAsSystem(() => query('SELECT provider, credentials FROM platform_ai_keys')),
  ]);
  const ownKeys = await decryptedKeys(ownRows.rows);
  const platformKeys = await decryptedKeys(platformRows.rows);

  const chosen = settings[`${kind}_provider`];
  const candidates = chosen ? [chosen] : PREFERRED_ORDER[kind];
  for (const providerKey of candidates) {
    const provider = getAiProvider(providerKey);
    if (!provider?.capabilities[kind]) continue;
    const model = platformSettings.aiModels?.[providerKey]?.[kind] ?? provider.defaultModels[kind];
    if (providerKey === 'ollama') {
      if (platformSettings.aiOllamaUrl) return { provider, apiKey: platformSettings.aiOllamaUrl, model, usesPlatformKey: false }; // free: our own server
      continue;
    }
    if (ownKeys.has(providerKey)) return { provider, apiKey: ownKeys.get(providerKey), model, usesPlatformKey: false };
    if (platformKeys.has(providerKey)) return { provider, apiKey: platformKeys.get(providerKey), model, usesPlatformKey: true };
  }
  const what = { text: 'writing', image: 'images', video: 'videos' }[kind];
  const names = candidates.map((key) => getAiProvider(key)?.label).filter(Boolean).join(' or ');
  throw badRequest(`No AI key is set up for ${what} yet. Connect ${names} under Settings → AI.`);
}

/** For the Settings → AI page: every provider, what it can do, and whether a key is available. */
export async function describeProviders() {
  const [own, platform] = await Promise.all([listOrganizationKeys(), listPlatformKeys()]);
  return listAiProviders()
    .filter((provider) => provider.key !== 'ollama') // no key to connect; see Platform → AI
    .map((provider) => ({
    ...provider,
    ownKey: own.find((key) => key.provider === provider.key) ?? null,
    platformKeyAvailable: platform.some((key) => key.provider === provider.key),
  }));
}
