import { anthropicProvider } from './anthropic.js';
import { geminiProvider } from './gemini.js';
import { openaiProvider } from './openai.js';
import { ollamaProvider } from './ollama.js';

/**
 * Every AI provider the app can use. Each one exports the same shape:
 *   key, label, capabilities { text, image, video, research }, defaultModels { text, image?, video? },
 *   testKey(apiKey), generateText(...), and when capable research(...), generateImage(...), startVideo(...), checkVideo(...).
 * When no provider is set up at all, the built-in FREE agent (src/ai/free) does the job instead.
 * To add one (e.g. Mistral): write ./mistral.js in the same shape and add it to the list below.
 */
const PROVIDERS = new Map([anthropicProvider, openaiProvider, geminiProvider, ollamaProvider].map((provider) => [provider.key, provider]));

/** Which provider to try first for each kind of work, when the organization has not chosen one. */
export const PREFERRED_ORDER = {
  text: ['anthropic', 'openai', 'gemini', 'ollama'],
  image: ['openai', 'gemini'],
  video: ['openai', 'gemini'],
};

export const AI_PROVIDER_KEYS = [...PROVIDERS.keys()];

export const getAiProvider = (key) => PROVIDERS.get(key) ?? null;

export const listAiProviders = () =>
  [...PROVIDERS.values()].map(({ key, label, capabilities, defaultModels }) => ({ key, label, capabilities, defaultModels }));

/** Tests only: swap a provider for a fake one, so tests never call a real (paid) API. */
export function replaceAiProviderForTests(key, fake) {
  const original = PROVIDERS.get(key);
  PROVIDERS.set(key, { ...original, ...fake });
  return () => PROVIDERS.set(key, original);
}
