import { z } from 'zod';
import { query, runAsSystem } from '../db/pool.js';

/**
 * Platform-wide settings, edited by the platform owner under Platform → Settings.
 * Stored as one JSON value (table platform_settings), so adding a setting = adding it below.
 */
export const PLATFORM_DEFAULTS = {
  // Sign-up
  signupEnabled: true,
  trialPlanId: 'pro', // plan a new organization tries for free...
  trialDays: 14, //    ...for this many days (0 = no trial, start on Free)

  // Shown to customers on the "Pay" screen
  upiId: '',
  upiName: '',
  bankAccountName: '',
  bankAccountNumber: '',
  bankIfsc: '',
  bankName: '',
  paymentNote: 'After paying, submit the transaction ID (UTR) below. Your plan is activated as soon as we verify it.',

  // Printed on invoices as the seller
  companyName: '',
  companyAddress: '',
  companyGstin: '',
  companyEmail: '',
  companyPhone: '',
  taxLabel: 'GST',
  taxRate: 18, // percent, added on top of the plan price (0 = no tax)
  invoicePrefix: 'INV',

  // AI Studio, for everyone (each organization can also be switched on/off/hidden separately)
  aiEnabled: true,
  aiHiddenWhenDisabled: false, // true: when AI is off, hide it completely instead of showing it locked
  // Free self-hosted AI for everyone (no key, no credits). Empty = not used. e.g. http://localhost:11434
  aiOllamaUrl: '',
  // Model used for each provider and job. Change these when a provider releases a new model — no code change.
  aiModels: {
    anthropic: { text: 'claude-opus-5-5' },
    openai: { text: 'gpt-5', image: 'gpt-image-1', video: 'sora-2' },
    gemini: { text: 'gemini-2.5-flash', image: 'imagen-4.0-generate-001', video: 'veo-3.0-generate-001' },
    ollama: { text: 'llama3.1' },
  },
};

const text = (max) => z.string().trim().max(max);

/** What the owner may save. Every field is optional: unsent fields keep their current value. */
export const platformSettingsSchema = z
  .object({
    signupEnabled: z.boolean(),
    trialPlanId: text(40),
    trialDays: z.number().int().min(0).max(365),
    upiId: text(100),
    upiName: text(100),
    bankAccountName: text(120),
    bankAccountNumber: text(40),
    bankIfsc: text(20),
    bankName: text(120),
    paymentNote: text(1000),
    companyName: text(160),
    companyAddress: text(500),
    companyGstin: text(20),
    companyEmail: text(254),
    companyPhone: text(40),
    taxLabel: text(20),
    taxRate: z.number().min(0).max(100),
    invoicePrefix: z.string().trim().min(1).max(10).regex(/^[A-Z0-9-]+$/i, 'Use letters, numbers and dashes only'),
    aiEnabled: z.boolean(),
    aiHiddenWhenDisabled: z.boolean(),
    aiOllamaUrl: z.union([z.literal(''), z.string().trim().url().max(200)]),
    aiModels: z.object({
      anthropic: z.object({ text: text(100) }).partial(),
      openai: z.object({ text: text(100), image: text(100), video: text(100) }).partial(),
      gemini: z.object({ text: text(100), image: text(100), video: text(100) }).partial(),
      ollama: z.object({ text: text(100) }).partial(),
    }).partial(),
  })
  .partial();

/** Current settings, with defaults filled in. Works from any context (it is not tenant data). */
export async function getPlatformSettings() {
  const result = await runAsSystem(() => query('SELECT value FROM platform_settings WHERE id = true'));
  const saved = result.rows[0]?.value ?? {};
  // aiModels is nested: merge per provider, so saving one model never wipes the defaults of the others.
  const aiModels = Object.fromEntries(
    Object.entries(PLATFORM_DEFAULTS.aiModels).map(([provider, models]) => [provider, { ...models, ...saved.aiModels?.[provider] }])
  );
  return { ...PLATFORM_DEFAULTS, ...saved, aiModels };
}

export async function savePlatformSettings(changes) {
  const current = await getPlatformSettings();
  const next = { ...current, ...changes };
  if (changes.aiModels) {
    next.aiModels = Object.fromEntries(
      Object.entries(current.aiModels).map(([provider, models]) => [provider, { ...models, ...changes.aiModels[provider] }])
    );
  }
  await runAsSystem(() =>
    query(
      `INSERT INTO platform_settings (id, value) VALUES (true, $1)
       ON CONFLICT (id) DO UPDATE SET value = EXCLUDED.value, updated_at = now()`,
      [JSON.stringify(next)]
    )
  );
  return next;
}
