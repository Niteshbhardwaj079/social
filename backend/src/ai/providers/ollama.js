import { AiProviderError, requestJson } from '../http.js';

/**
 * Ollama — free, open-source AI models (Llama, Qwen, Mistral...) running on a server YOU control.
 * No API key and no credits: the platform owner sets its address under Platform → AI
 * (for example http://localhost:11434 on the same machine). Text only.
 * Here `apiKey` carries that address, so this provider fits the same shape as the others.
 */
const LABEL = 'Ollama (self-hosted)';

const base = (address) => String(address).replace(/\/+$/, '');

export const ollamaProvider = {
  key: 'ollama',
  label: LABEL,
  capabilities: { text: true, image: false, video: false, research: false },
  defaultModels: { text: 'llama3.1' },

  async testKey(address) {
    await requestJson(LABEL, `${base(address)}/api/tags`, { timeoutMs: 10_000 });
  },

  async generateText({ apiKey: address, model, system, prompt }) {
    const data = await requestJson(LABEL, `${base(address)}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model,
        stream: false,
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: prompt },
        ],
      }),
      timeoutMs: 300_000, // a small server can be slow; never longer than this
    });
    const text = data?.message?.content?.trim();
    if (!text) throw new AiProviderError(`${LABEL} returned an empty answer. Is the model "${model}" downloaded (ollama pull ${model})?`);
    return text;
  },
};
