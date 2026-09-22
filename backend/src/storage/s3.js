import crypto from 'node:crypto';
import { config } from '../config/env.js';
import { StorageError } from './errors.js';

/**
 * AWS Signature Version 4, written out by hand (no AWS SDK) so this works against Amazon S3 and every
 * S3-compatible provider the connect form offers (R2, B2, Wasabi, Spaces, MinIO/"other") from one function.
 * Reference: https://docs.aws.amazon.com/AmazonS3/latest/API/sig-v4-header-based-auth.html
 */
const sha256Hex = (data) => crypto.createHash('sha256').update(data).digest('hex');
const hmac = (key, data) => crypto.createHmac('sha256', key).update(data, 'utf8').digest();
const EMPTY_HASH = sha256Hex(Buffer.alloc(0));

// AWS's own "unreserved characters" rule — encodeURIComponent leaves a few extra characters unescaped.
const encodeSegment = (segment) => encodeURIComponent(segment).replace(/[!'()*]/g, (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`);
const encodePath = (key) => `/${key.split('/').map(encodeSegment).join('/')}`;

function signingKey(secret, date, region) {
  const kDate = hmac(`AWS4${secret}`, date);
  const kRegion = hmac(kDate, region);
  const kService = hmac(kRegion, 's3');
  return hmac(kService, 'aws4_request');
}

/**
 * The signing math on its own (no network) — a canonical request, a string to sign, and the Authorization
 * header, exactly as the SigV4 spec defines them. Exported so a test can check it against an independent
 * from-scratch computation of the same public algorithm, without this module ever making a real request.
 */
export function signRequest({ method, canonicalUri, canonicalQuery = '', headers, payloadHash, accessKeyId, secretAccessKey, region, amzDate }) {
  const date = amzDate.slice(0, 8);
  const signedHeaderNames = Object.keys(headers).sort();
  const canonicalHeaders = signedHeaderNames.map((name) => `${name}:${headers[name]}\n`).join('');
  const signedHeaders = signedHeaderNames.join(';');

  const canonicalRequest = [method, canonicalUri, canonicalQuery, canonicalHeaders, signedHeaders, payloadHash].join('\n');
  const scope = `${date}/${region}/s3/aws4_request`;
  const stringToSign = ['AWS4-HMAC-SHA256', amzDate, scope, sha256Hex(canonicalRequest)].join('\n');
  const signature = hmac(signingKey(secretAccessKey, date, region), stringToSign).toString('hex');

  return { signature, signedHeaders, authorization: `AWS4-HMAC-SHA256 Credential=${accessKeyId}/${scope}, SignedHeaders=${signedHeaders}, Signature=${signature}` };
}

/** Region AWS SigV4 expects for a provider. R2 always uses "auto"; others are guessed from the endpoint, AWS style. */
export function regionFor(provider, host) {
  if (provider.key === 's3') return provider.values.region;
  if (provider.key === 'r2') return 'auto';
  const match = host.match(/^s3[.-]([a-z0-9-]+)\./);
  return match ? match[1] : 'us-east-1';
}

export function endpointFor(provider) {
  if (provider.key === 's3') return { host: `s3.${provider.values.region}.amazonaws.com`, protocol: 'https:' };
  try {
    const url = new URL(provider.values.endpointUrl);
    return { host: url.host, protocol: url.protocol };
  } catch {
    throw new StorageError('The endpoint URL is not valid. It should look like https://s3.example.com.');
  }
}

/**
 * One signed S3 REST call. `key` is the object key (may contain "/"). `body` is a Buffer, or undefined for
 * GET/DELETE/HEAD. Always path-style (`https://host/bucket/key`) — the one form every listed provider accepts.
 */
async function request(provider, { method, key, body, query = {} }) {
  const { host, protocol } = endpointFor(provider);
  const region = regionFor(provider, host);
  const bucket = provider.values.bucket;
  const now = new Date();
  const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, '');
  const payloadHash = body ? sha256Hex(body) : EMPTY_HASH;

  const canonicalUri = `${encodePath(bucket)}${encodePath(key)}`;
  const canonicalQuery = Object.entries(query)
    .map(([queryKey, value]) => [encodeSegment(queryKey), encodeSegment(String(value))])
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([queryKey, value]) => `${queryKey}=${value}`)
    .join('&');
  const headers = { host, 'x-amz-content-sha256': payloadHash, 'x-amz-date': amzDate };
  const { authorization } = signRequest({
    method,
    canonicalUri,
    canonicalQuery,
    headers,
    payloadHash,
    accessKeyId: provider.values.accessKeyId,
    secretAccessKey: provider.values.secretAccessKey,
    region,
    amzDate,
  });
  const url = `${protocol}//${host}${canonicalUri}${canonicalQuery ? `?${canonicalQuery}` : ''}`;

  let response;
  try {
    response = await fetch(url, {
      method,
      headers: { ...headers, authorization, ...(body ? { 'content-length': String(body.length) } : {}) },
      body,
      redirect: 'error',
      signal: AbortSignal.timeout(config.social.providerTimeoutMs),
    });
  } catch {
    throw new StorageError(`Could not reach ${host}. Check the endpoint address and that this server can reach the internet.`, 'unreachable');
  }
  return response;
}

async function readError(response) {
  const text = await response.text().catch(() => '');
  const match = text.match(/<Message>([^<]*)<\/Message>/);
  return match ? match[1] : `${response.status} ${response.statusText}`;
}

export async function putObject(provider, key, body, contentType) {
  const response = await request(provider, { method: 'PUT', key, body, query: {} });
  if (!response.ok) {
    const message = await readError(response);
    throw new StorageError(
      response.status === 403 || response.status === 401
        ? `The storage provider refused this upload (${message}). Check the keys and that they can write to this bucket.`
        : `The upload failed (${message}).`,
      response.status === 403 || response.status === 401 ? 'auth' : 'rejected'
    );
  }
  void contentType; // content-type is not required for SigV4 signing to succeed; the object still serves correctly by extension on most providers
  return { key };
}

export async function getObjectBytes(provider, key) {
  const response = await request(provider, { method: 'GET', key });
  if (!response.ok) throw new StorageError(`Could not read the file back from storage (${await readError(response)}).`, 'rejected');
  return Buffer.from(await response.arrayBuffer());
}

export async function deleteObject(provider, key) {
  const response = await request(provider, { method: 'DELETE', key });
  if (!response.ok && response.status !== 404) throw new StorageError(`Could not delete the file (${await readError(response)}).`, 'rejected');
}

/** Proves the keys can write, read and delete in this bucket — without leaving anything behind. */
export async function testConnection(provider) {
  const key = `social-connection-test-${crypto.randomBytes(6).toString('hex')}.txt`;
  const body = Buffer.from('Social connection test');
  await putObject(provider, key, body, 'text/plain');
  const read = await getObjectBytes(provider, key);
  await deleteObject(provider, key);
  if (!read.equals(body)) throw new StorageError('The file that came back was not what was uploaded. Double-check the bucket and endpoint.', 'rejected');
}

export function publicUrlFor(provider, key) {
  const base = provider.values.publicBaseUrl?.trim().replace(/\/+$/, '');
  if (base) return `${base}/${key}`;
  const { host, protocol } = endpointFor(provider);
  return `${protocol}//${host}/${provider.values.bucket}/${key}`;
}
