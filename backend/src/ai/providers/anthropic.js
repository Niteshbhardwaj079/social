import Anthropic from '@anthropic-ai/sdk';
import { AiProviderError } from '../http.js';

/**
 * Claude (Anthropic) — writes posts, captions, hashtags and video scripts. Claude does not make
 * images or videos, so those go to OpenAI or Gemini.
 *
 * Uses the official SDK. `fallbacks: 'default'` (server-side fallback beta) lets Anthropic re-run a
 * request on another Claude model if the first one declines it for safety reasons, instead of failing.
 */
const LABEL = 'Claude (Anthropic)';
const TEXT_TIMEOUT_MS = 120_000;

function clientFor(apiKey) {
  // maxRetries: 1 — one quick retry on a network blip / 429 / 5xx, never a long stall.
  return new Anthropic({ apiKey, timeout: TEXT_TIMEOUT_MS, maxRetries: 1 });
}

/** The SDK's typed errors → one friendly AiProviderError. */
function translateError(error) {
  if (error instanceof AiProviderError) return error;
  if (error instanceof Anthropic.AuthenticationError || error instanceof Anthropic.PermissionDeniedError) {
    return new AiProviderError(`${LABEL} rejected the API key. Check the key and try again.`, { status: error.status, kind: 'auth' });
  }
  if (error instanceof Anthropic.RateLimitError) {
    return new AiProviderError(`${LABEL} rate limit or quota reached. Try again in a little while.`, { status: 429, kind: 'quota' });
  }
  if (error instanceof Anthropic.APIConnectionTimeoutError) {
    return new AiProviderError(`${LABEL} took too long to answer. Please try again.`, { kind: 'timeout' });
  }
  if (error instanceof Anthropic.APIConnectionError) {
    return new AiProviderError(`Could not reach ${LABEL}. Check the server's internet connection.`);
  }
  if (error instanceof Anthropic.APIError) {
    return new AiProviderError(`${LABEL} returned an error (${error.status ?? 'unknown'}): ${String(error.message).slice(0, 300)}`, { status: error.status });
  }
  return new AiProviderError(`${LABEL} failed: ${String(error?.message || error).slice(0, 300)}`);
}

export const anthropicProvider = {
  key: 'anthropic',
  label: LABEL,
  capabilities: { text: true, image: false, video: false, research: true },
  defaultModels: { text: 'claude-opus-5-5' },

  async testKey(apiKey) {
    try {
      await clientFor(apiKey).models.list({ limit: 1 });
    } catch (error) {
      throw translateError(error);
    }
  },

  async generateText({ apiKey, model, system, prompt, maxTokens = 4000 }) {
    let response;
    try {
      response = await clientFor(apiKey).beta.messages.create({
        model,
        max_tokens: maxTokens,
        betas: ['server-side-fallback-2026-07-01'],
        fallbacks: 'default',
        output_config: { effort: 'medium' }, // social posts are short: medium keeps answers quick and cheap
        system,
        messages: [{ role: 'user', content: prompt }],
      });
    } catch (error) {
      throw translateError(error);
    }
    if (response.stop_reason === 'refusal') {
      throw new AiProviderError(`${LABEL} declined this request. Try rewording the brief.`, { kind: 'refused' });
    }
    const text = response.content
      .filter((block) => block.type === 'text')
      .map((block) => block.text)
      .join('')
      .trim();
    if (!text) throw new AiProviderError(`${LABEL} returned an empty answer. Please try again.`);
    return text;
  },

  /**
   * Research with live web search (Anthropic's server-side web_search tool). Returns { text, sources }.
   * A long search can pause the turn (stop_reason "pause_turn"): we hand the paused turn back so
   * Claude continues — at most a few times, so it can never loop for ever.
   */
  async research({ apiKey, model, system, prompt }) {
    const client = new Anthropic({ apiKey, timeout: 300_000, maxRetries: 1 });
    const messages = [{ role: 'user', content: prompt }];
    let response;
    try {
      for (let round = 0; round < 4; round += 1) {
        response = await client.beta.messages.create({
          model,
          max_tokens: 16000,
          betas: ['server-side-fallback-2026-07-01'],
          fallbacks: 'default',
          output_config: { effort: 'medium' },
          system,
          tools: [{ type: 'web_search_20260209', name: 'web_search', max_uses: 8 }],
          messages,
        });
        if (response.stop_reason !== 'pause_turn') break;
        messages.push({ role: 'assistant', content: response.content });
      }
    } catch (error) {
      throw translateError(error);
    }
    if (response.stop_reason === 'refusal') throw new AiProviderError(`${LABEL} declined this research. Try changing the Brand Kit wording.`, { kind: 'refused' });

    const sources = [];
    for (const block of response.content) {
      // Search results come as a list on success, or a single error object — only lists hold sources.
      if (block.type === 'web_search_tool_result' && Array.isArray(block.content)) {
        for (const result of block.content) if (result.url) sources.push({ title: result.title || result.url, url: result.url });
      }
    }
    const text = response.content
      .filter((block) => block.type === 'text')
      .map((block) => block.text)
      .join('')
      .trim();
    if (!text) throw new AiProviderError(`${LABEL} returned an empty research answer. Please try again.`);
    return { text, sources };
  },
};
