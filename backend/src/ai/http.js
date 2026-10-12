/**
 * Shared helpers for talking to AI providers over HTTPS.
 * Every call has a hard timeout, so a slow or stuck provider can never hang a request or a job.
 */

/** An AI provider said no (bad key, quota, refused prompt...). `message` is safe to show to the customer. */
export class AiProviderError extends Error {
  constructor(message, { status = null, kind = 'provider_error' } = {}) {
    super(message);
    this.name = 'AiProviderError';
    this.status = status;
    this.kind = kind; // 'auth' | 'quota' | 'refused' | 'timeout' | 'provider_error'
  }
}

/** Turns an HTTP status into a plain-language reason. */
function describeStatus(status, providerLabel, detail) {
  if (status === 401 || status === 403) return new AiProviderError(`${providerLabel} rejected the API key. Check the key and try again.`, { status, kind: 'auth' });
  if (status === 429) return new AiProviderError(`${providerLabel} says the quota or rate limit is reached. Try again later or check your billing with ${providerLabel}.`, { status, kind: 'quota' });
  const suffix = detail ? `: ${String(detail).slice(0, 300)}` : '';
  return new AiProviderError(`${providerLabel} returned an error (${status})${suffix}`, { status });
}

/** Pulls a readable message out of the usual JSON error shapes ({ error: { message } }, { error: "..." }). */
function errorDetail(body) {
  if (!body || typeof body !== 'object') return null;
  if (typeof body.error === 'string') return body.error;
  return body.error?.message ?? body.message ?? null;
}

/**
 * fetch() with a timeout. Returns the parsed JSON (or the raw Response when `raw` is true).
 * Throws AiProviderError with a friendly message on any failure.
 */
export async function requestJson(providerLabel, url, { method = 'GET', headers = {}, body, timeoutMs = 60_000, raw = false } = {}) {
  let response;
  try {
    response = await fetch(url, { method, headers, body, signal: AbortSignal.timeout(timeoutMs), redirect: 'follow' });
  } catch (error) {
    if (error?.name === 'TimeoutError' || error?.name === 'AbortError') {
      throw new AiProviderError(`${providerLabel} took too long to answer. Please try again.`, { kind: 'timeout' });
    }
    throw new AiProviderError(`Could not reach ${providerLabel}. Check the server's internet connection.`);
  }
  if (raw && response.ok) return response;
  const text = await response.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    // not JSON
  }
  if (!response.ok) throw describeStatus(response.status, providerLabel, errorDetail(json) ?? text);
  return json;
}

/** Downloads a file (an image or video the provider made) into memory. */
export async function downloadBytes(providerLabel, url, { headers = {}, timeoutMs = 300_000 } = {}) {
  const response = await requestJson(providerLabel, url, { headers, timeoutMs, raw: true });
  return {
    buffer: Buffer.from(await response.arrayBuffer()),
    contentType: response.headers.get('content-type')?.split(';')[0] || 'application/octet-stream',
  };
}
