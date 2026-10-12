import { AiProviderError, downloadBytes, requestJson } from '../http.js';

/**
 * Google Gemini — text (Gemini), images (Imagen) and text-to-video (Veo).
 * Plain HTTPS calls to the Gemini API; model names come from Platform → AI.
 */
const LABEL = 'Google Gemini';
const BASE = 'https://generativelanguage.googleapis.com/v1beta';

const auth = (apiKey) => ({ 'x-goog-api-key': apiKey });
const modelUrl = (model, action) => `${BASE}/models/${encodeURIComponent(model)}:${action}`;

const ASPECT = { square: '1:1', portrait: '9:16', landscape: '16:9' };

export const geminiProvider = {
  key: 'gemini',
  label: LABEL,
  capabilities: { text: true, image: true, video: true, research: true },
  defaultModels: { text: 'gemini-2.5-flash', image: 'imagen-4.0-generate-001', video: 'veo-3.0-generate-001' },

  async testKey(apiKey) {
    await requestJson(LABEL, `${BASE}/models?pageSize=1`, { headers: auth(apiKey), timeoutMs: 20_000 });
  },

  async generateText({ apiKey, model, system, prompt, maxTokens = 4000 }) {
    const data = await requestJson(LABEL, modelUrl(model, 'generateContent'), {
      method: 'POST',
      headers: { ...auth(apiKey), 'Content-Type': 'application/json' },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: system }] },
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: { maxOutputTokens: maxTokens },
      }),
      timeoutMs: 120_000,
    });
    const candidate = data?.candidates?.[0];
    if (candidate?.finishReason === 'SAFETY') throw new AiProviderError(`${LABEL} declined this request. Try rewording the brief.`, { kind: 'refused' });
    const text = (candidate?.content?.parts ?? [])
      .map((part) => part.text ?? '')
      .join('')
      .trim();
    if (!text) throw new AiProviderError(`${LABEL} returned an empty answer. Please try again.`);
    return text;
  },

  /** Research grounded in Google Search. Returns { text, sources }. */
  async research({ apiKey, model, system, prompt }) {
    const data = await requestJson(LABEL, modelUrl(model, 'generateContent'), {
      method: 'POST',
      headers: { ...auth(apiKey), 'Content-Type': 'application/json' },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: system }] },
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        tools: [{ google_search: {} }],
      }),
      timeoutMs: 300_000,
    });
    const candidate = data?.candidates?.[0];
    const text = (candidate?.content?.parts ?? [])
      .map((part) => part.text ?? '')
      .join('')
      .trim();
    if (!text) throw new AiProviderError(`${LABEL} returned an empty research answer. Please try again.`);
    const sources = (candidate?.groundingMetadata?.groundingChunks ?? [])
      .map((chunk) => chunk.web)
      .filter((web) => web?.uri)
      .map((web) => ({ title: web.title || web.uri, url: web.uri }));
    return { text, sources };
  },

  async generateImage({ apiKey, model, prompt, aspect = 'square' }) {
    const data = await requestJson(LABEL, modelUrl(model, 'predict'), {
      method: 'POST',
      headers: { ...auth(apiKey), 'Content-Type': 'application/json' },
      body: JSON.stringify({ instances: [{ prompt }], parameters: { sampleCount: 1, aspectRatio: ASPECT[aspect] ?? ASPECT.square } }),
      timeoutMs: 180_000,
    });
    const prediction = data?.predictions?.[0];
    if (!prediction?.bytesBase64Encoded) throw new AiProviderError(`${LABEL} did not return an image (it may have been filtered). Try another prompt.`);
    return { buffer: Buffer.from(prediction.bytesBase64Encoded, 'base64'), contentType: prediction.mimeType || 'image/png' };
  },

  /** Starts a Veo job (a long-running operation); the AI job worker polls checkVideo(). */
  async startVideo({ apiKey, model, prompt, aspect = 'portrait' }) {
    const data = await requestJson(LABEL, modelUrl(model, 'predictLongRunning'), {
      method: 'POST',
      headers: { ...auth(apiKey), 'Content-Type': 'application/json' },
      // Veo makes 16:9 or 9:16 only; "square" falls back to vertical, the usual shape for Reels/Shorts.
      body: JSON.stringify({ instances: [{ prompt }], parameters: { aspectRatio: aspect === 'landscape' ? '16:9' : '9:16' } }),
      timeoutMs: 60_000,
    });
    if (!data?.name) throw new AiProviderError(`${LABEL} did not start the video. Please try again.`);
    return { jobId: data.name };
  },

  async checkVideo({ apiKey, jobId }) {
    const data = await requestJson(LABEL, `${BASE}/${jobId}`, { headers: auth(apiKey), timeoutMs: 30_000 });
    if (!data?.done) return { status: 'running' };
    if (data.error) return { status: 'failed', error: data.error.message || 'The video could not be made.' };
    const uri = data.response?.generateVideoResponse?.generatedSamples?.[0]?.video?.uri;
    if (!uri) return { status: 'failed', error: 'No video came back (it may have been filtered). Try another prompt.' };
    const file = await downloadBytes(LABEL, uri, { headers: auth(apiKey) });
    return { status: 'succeeded', buffer: file.buffer, contentType: 'video/mp4' };
  },
};
