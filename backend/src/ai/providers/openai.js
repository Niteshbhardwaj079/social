import { AiProviderError, downloadBytes, requestJson } from '../http.js';

/**
 * OpenAI — text (GPT), images (gpt-image) and short text-to-video (Sora).
 * Plain HTTPS calls; model names come from Platform → AI so a new model needs no code change.
 */
const LABEL = 'OpenAI';
const BASE = 'https://api.openai.com/v1';

const auth = (apiKey) => ({ Authorization: `Bearer ${apiKey}` });

// Our aspect names → the sizes each OpenAI endpoint accepts.
const IMAGE_SIZE = { square: '1024x1024', portrait: '1024x1536', landscape: '1536x1024' };
const VIDEO_SIZE = { square: '720x1280', portrait: '720x1280', landscape: '1280x720' };

export const openaiProvider = {
  key: 'openai',
  label: LABEL,
  capabilities: { text: true, image: true, video: true, research: true },
  defaultModels: { text: 'gpt-5', image: 'gpt-image-1', video: 'sora-2' },

  async testKey(apiKey) {
    await requestJson(LABEL, `${BASE}/models`, { headers: auth(apiKey), timeoutMs: 20_000 });
  },

  async generateText({ apiKey, model, system, prompt, maxTokens = 4000 }) {
    const data = await requestJson(LABEL, `${BASE}/chat/completions`, {
      method: 'POST',
      headers: { ...auth(apiKey), 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model,
        max_completion_tokens: maxTokens,
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: prompt },
        ],
      }),
      timeoutMs: 120_000,
    });
    const text = data?.choices?.[0]?.message?.content?.trim();
    if (!text) throw new AiProviderError(`${LABEL} returned an empty answer. Please try again.`);
    return text;
  },

  /** Research with live web search (Responses API + web_search tool). Returns { text, sources }. */
  async research({ apiKey, model, system, prompt }) {
    const data = await requestJson(LABEL, `${BASE}/responses`, {
      method: 'POST',
      headers: { ...auth(apiKey), 'Content-Type': 'application/json' },
      body: JSON.stringify({ model, instructions: system, input: prompt, tools: [{ type: 'web_search' }] }),
      timeoutMs: 300_000,
    });
    const parts = (data?.output ?? []).filter((item) => item.type === 'message').flatMap((item) => item.content ?? []);
    const text = parts
      .filter((part) => part.type === 'output_text')
      .map((part) => part.text)
      .join('')
      .trim();
    if (!text) throw new AiProviderError(`${LABEL} returned an empty research answer. Please try again.`);
    const sources = parts
      .flatMap((part) => part.annotations ?? [])
      .filter((annotation) => annotation.type === 'url_citation' && annotation.url)
      .map((annotation) => ({ title: annotation.title || annotation.url, url: annotation.url }));
    return { text, sources };
  },

  async generateImage({ apiKey, model, prompt, aspect = 'square' }) {
    const data = await requestJson(LABEL, `${BASE}/images/generations`, {
      method: 'POST',
      headers: { ...auth(apiKey), 'Content-Type': 'application/json' },
      body: JSON.stringify({ model, prompt, n: 1, size: IMAGE_SIZE[aspect] ?? IMAGE_SIZE.square }),
      timeoutMs: 180_000,
    });
    const image = data?.data?.[0];
    if (image?.b64_json) return { buffer: Buffer.from(image.b64_json, 'base64'), contentType: 'image/png' };
    if (image?.url) return downloadBytes(LABEL, image.url, { timeoutMs: 60_000 });
    throw new AiProviderError(`${LABEL} did not return an image. Please try again.`);
  },

  /** Starts a Sora job. Videos take minutes, so the AI job worker polls checkVideo() until it is done. */
  async startVideo({ apiKey, model, prompt, aspect = 'portrait', seconds = 8 }) {
    const form = new FormData();
    form.append('model', model);
    form.append('prompt', prompt);
    form.append('seconds', String(seconds));
    form.append('size', VIDEO_SIZE[aspect] ?? VIDEO_SIZE.portrait);
    const data = await requestJson(LABEL, `${BASE}/videos`, { method: 'POST', headers: auth(apiKey), body: form, timeoutMs: 60_000 });
    if (!data?.id) throw new AiProviderError(`${LABEL} did not start the video. Please try again.`);
    return { jobId: data.id };
  },

  async checkVideo({ apiKey, jobId }) {
    const data = await requestJson(LABEL, `${BASE}/videos/${encodeURIComponent(jobId)}`, { headers: auth(apiKey), timeoutMs: 30_000 });
    if (data?.status === 'failed') return { status: 'failed', error: data?.error?.message || 'The video could not be made.' };
    if (data?.status !== 'completed') return { status: 'running' };
    const file = await downloadBytes(LABEL, `${BASE}/videos/${encodeURIComponent(jobId)}/content`, { headers: auth(apiKey) });
    return { status: 'succeeded', buffer: file.buffer, contentType: 'video/mp4' };
  },
};
