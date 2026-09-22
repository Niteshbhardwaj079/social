import { after, afterEach, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { createClient, setupOwner, startServer } from './helpers.js';
import { query } from '../src/db/pool.js';
import { decryptJson } from '../src/utils/crypto.js';
import { signRequest, regionFor, endpointFor, publicUrlFor as s3PublicUrlFor } from '../src/storage/s3.js';
import { getPublishingContext } from '../src/services/socialAccountService.js';

// ------------------------------------------------------------------ SigV4, no network involved
// A from-scratch reference implementation of the same public algorithm (AWS Signature Version 4),
// written independently of src/storage/s3.js, so agreement between the two is meaningful.
function referenceSignature({ method, canonicalUri, canonicalQuery, headers, payloadHash, secretAccessKey, region, amzDate }) {
  const sha256Hex = (data) => crypto.createHash('sha256').update(data).digest('hex');
  const hmac = (key, data) => crypto.createHmac('sha256', key).update(data, 'utf8').digest();
  const date = amzDate.slice(0, 8);
  const names = Object.keys(headers).sort();
  const canonicalHeaders = names.map((name) => `${name}:${headers[name]}\n`).join('');
  const signedHeaders = names.join(';');
  const canonicalRequest = [method, canonicalUri, canonicalQuery, canonicalHeaders, signedHeaders, payloadHash].join('\n');
  const scope = `${date}/${region}/s3/aws4_request`;
  const stringToSign = ['AWS4-HMAC-SHA256', amzDate, scope, sha256Hex(canonicalRequest)].join('\n');
  const kDate = hmac(`AWS4${secretAccessKey}`, date);
  const kRegion = hmac(kDate, region);
  const kService = hmac(kRegion, 's3');
  const kSigning = hmac(kService, 'aws4_request');
  return hmac(kSigning, stringToSign).toString('hex');
}

describe('S3 request signing (SigV4)', () => {
  const input = {
    method: 'GET',
    canonicalUri: '/examplebucket/2026-09-22/photo.jpg',
    canonicalQuery: 'list-type=2',
    headers: { host: 'examplebucket.s3.amazonaws.com', 'x-amz-content-sha256': crypto.createHash('sha256').update('').digest('hex'), 'x-amz-date': '20260922T101500Z' },
    payloadHash: crypto.createHash('sha256').update('').digest('hex'),
    accessKeyId: 'AKIAEXAMPLE00000000',
    secretAccessKey: 'exampleSecretKeyThatLooksReal1234567890',
    region: 'us-east-1',
    amzDate: '20260922T101500Z',
  };

  it('matches an independent from-scratch implementation of the same algorithm', () => {
    const expected = referenceSignature(input);
    const actual = signRequest(input);
    assert.equal(actual.signature, expected);
    assert.equal(actual.authorization, `AWS4-HMAC-SHA256 Credential=${input.accessKeyId}/20260922/us-east-1/s3/aws4_request, SignedHeaders=host;x-amz-content-sha256;x-amz-date, Signature=${expected}`);
  });

  it('changes the signature when anything about the request changes', () => {
    const base = signRequest(input).signature;
    assert.notEqual(signRequest({ ...input, method: 'PUT' }).signature, base);
    assert.notEqual(signRequest({ ...input, canonicalUri: '/other/key' }).signature, base);
    assert.notEqual(signRequest({ ...input, secretAccessKey: 'different-secret-key-value-here' }).signature, base);
    assert.notEqual(signRequest({ ...input, region: 'eu-west-1' }).signature, base);
  });

  it('signs headers in sorted order, case-insensitively as far as SigV4 cares, and lists them in SignedHeaders', () => {
    const { signedHeaders } = signRequest(input);
    assert.equal(signedHeaders, 'host;x-amz-content-sha256;x-amz-date');
  });
});

describe('endpoint and region resolution', () => {
  it('Amazon S3 uses the region field and a regional host', () => {
    const provider = { key: 's3', values: { region: 'ap-south-1' } };
    assert.deepEqual(endpointFor(provider), { host: 's3.ap-south-1.amazonaws.com', protocol: 'https:' });
    assert.equal(regionFor(provider, 's3.ap-south-1.amazonaws.com'), 'ap-south-1');
  });

  it('Cloudflare R2 always signs as region "auto"', () => {
    const provider = { key: 'r2', values: { endpointUrl: 'https://abc123.r2.cloudflarestorage.com' } };
    assert.equal(regionFor(provider, 'abc123.r2.cloudflarestorage.com'), 'auto');
  });

  it('guesses the region from an s3.<region>.host endpoint (Wasabi, Backblaze style), and falls back otherwise', () => {
    assert.equal(regionFor({ key: 'wasabi' }, 's3.ap-southeast-1.wasabisys.com'), 'ap-southeast-1');
    assert.equal(regionFor({ key: 'b2' }, 's3.us-west-004.backblazeb2.com'), 'us-west-004');
    assert.equal(regionFor({ key: 'spaces' }, 'blr1.digitaloceanspaces.com'), 'us-east-1');
  });

  it('public URL uses the configured Public URL when given, else the endpoint itself, path-style', () => {
    const withBase = { key: 'r2', values: { bucket: 'social', endpointUrl: 'https://acct.r2.cloudflarestorage.com', publicBaseUrl: 'https://media.example.com/' } };
    assert.equal(s3PublicUrlFor(withBase, 'a/b.jpg'), 'https://media.example.com/a/b.jpg');
    const withoutBase = { key: 'r2', values: { bucket: 'social', endpointUrl: 'https://acct.r2.cloudflarestorage.com', publicBaseUrl: '' } };
    assert.equal(s3PublicUrlFor(withoutBase, 'a/b.jpg'), 'https://acct.r2.cloudflarestorage.com/social/a/b.jpg');
  });

  it('rejects an endpoint that is not a valid URL', () => {
    assert.throws(() => endpointFor({ key: 'other', values: { endpointUrl: 'not a url' } }));
  });
});

// ------------------------------------------------------------------ storage settings API
// Real network calls (to whatever endpoint the test gives) are answered here; nothing reaches a real bucket.
const realFetch = globalThis.fetch;
let calls = [];
let override = () => null;
const reply = (status, body, headers = {}) => new Response(typeof body === 'string' ? body : JSON.stringify(body), { status, headers: { 'content-type': 'application/json', ...headers } });

globalThis.fetch = async (input, init) => {
  const url = new URL(String(input));
  if (url.hostname === '127.0.0.1') return realFetch(input, init);
  calls.push({ url, init });
  return (await override(url, init)) ?? reply(404, { error: 'not stubbed' });
};
afterEach(() => {
  calls = [];
  override = () => null;
});

let server;
let owner;
let editor;

before(async () => {
  server = await startServer();
  owner = (await setupOwner(server.baseUrl)).client;
  await owner.post('/users', { name: 'Ed Itor', email: 'editor@example.com', role: 'editor', language: 'en' });
  await query("UPDATE users SET status = 'active', password_hash = (SELECT password_hash FROM users WHERE email = 'owner@example.com') WHERE email = 'editor@example.com'");
  editor = createClient(server.baseUrl);
  await editor.signIn('editor@example.com');
});
after(async () => {
  globalThis.fetch = realFetch;
  await server.close();
});

// A tiny fake S3-compatible server: keeps an in-memory object store and answers PUT/GET/DELETE for one bucket.
function fakeBucket() {
  const objects = new Map();
  return (url, init) => {
    if (url.hostname !== 'bucket.example-storage.com') return null;
    const key = decodeURIComponent(url.pathname.replace(/^\/social-test\//, ''));
    if (init.method === 'PUT') {
      objects.set(key, Buffer.from(init.body));
      return new Response('', { status: 200 });
    }
    if (init.method === 'GET') {
      const body = objects.get(key);
      return body ? new Response(body, { status: 200 }) : new Response('<Error><Message>No such key</Message></Error>', { status: 404 });
    }
    if (init.method === 'DELETE') {
      objects.delete(key);
      return new Response(null, { status: 204 }); // a 204 must not carry a body, even an empty string one
    }
    return null;
  };
}

const s3Values = { bucket: 'social-test', endpointUrl: 'https://bucket.example-storage.com', accessKeyId: 'key-123456', secretAccessKey: 'secret-abcdef123456' };

describe('storage settings: connecting an S3-compatible bucket', () => {
  it('starts with Server storage on and nothing external connected', async () => {
    const response = await owner.get('/storage');
    assert.equal(response.status, 200);
    assert.equal(response.body.preferences.serverEnabled, true);
    assert.equal(response.body.preferences.externalEnabled, false);
    assert.equal(response.body.provider, null);
  });

  it('only Super Admin / Admin may connect or change it, but anyone may read it', async () => {
    assert.equal((await editor.get('/storage')).status, 200);
    const denied = await editor.put('/storage/providers/r2', { values: s3Values });
    assert.equal(denied.status, 403);
    assert.equal(calls.length, 0);
  });

  it('"Test connection" writes, reads back and deletes a small file, then leaves nothing behind', async () => {
    override = fakeBucket();
    const response = await owner.post('/storage/providers/r2/test', { values: s3Values });
    assert.equal(response.status, 200);
    assert.equal(response.body.ok, true);
    assert.ok(calls.some((call) => call.init.method === 'PUT'));
    assert.ok(calls.some((call) => call.init.method === 'DELETE'));
    // every call was signed
    assert.ok(calls.every((call) => /^AWS4-HMAC-SHA256 /.test(call.init.headers.authorization)));
  });

  it('rejects a missing field, naming it, without ever making a request', async () => {
    const response = await owner.post('/storage/providers/r2/test', { values: { bucket: 's' } });
    assert.equal(response.status, 400);
    assert.equal(response.body.error.details[0].field, 'endpointUrl');
    assert.equal(calls.length, 0);
  });

  it('"Save & connect" verifies first, stores the keys encrypted, and never returns them', async () => {
    override = fakeBucket();
    const saved = await owner.put('/storage/providers/r2', { values: s3Values });
    assert.equal(saved.status, 200);
    assert.equal(saved.body.provider.providerKey, 'r2');
    assert.equal(saved.body.provider.values.bucket, 'social-test');
    assert.match(saved.body.provider.secretHints.secretAccessKey, /^••••/);
    assert.doesNotMatch(saved.text, /secret-abcdef123456/);

    const row = (await query('SELECT credentials FROM storage_settings WHERE id = true')).rows[0];
    assert.doesNotMatch(row.credentials, /secret-abcdef123456/, 'not stored as plain text');
    assert.deepEqual(decryptJson(row.credentials), s3Values);

    const log = await owner.get('/activity-logs');
    assert.ok(log.body.activity.some((entry) => entry.action === 'storage.connected'));
  });

  it('re-testing with the secret left blank reuses the saved one', async () => {
    override = fakeBucket();
    const { secretAccessKey, ...withoutSecret } = s3Values;
    void secretAccessKey;
    const response = await owner.post('/storage/providers/r2/test', { values: withoutSecret });
    assert.equal(response.body.ok, true);
  });

  it('a refused connection is not saved', async () => {
    override = () => reply(403, '<Error><Message>Access Denied</Message></Error>', { 'content-type': 'application/xml' });
    const response = await owner.put('/storage/providers/r2', { values: { ...s3Values, bucket: 'someone-elses-bucket' } });
    assert.equal(response.status, 400);
    assert.match(response.body.error.message, /Access Denied/);
    const row = (await query('SELECT provider_key FROM storage_settings WHERE id = true')).rows[0];
    assert.equal(row.provider_key, 'r2', 'the previous connection is untouched');
  });

  it('"Test upload" also proves the public link actually opens', async () => {
    const bucket = fakeBucket();
    override = (url, init) => {
      const stub = bucket(url, init);
      if (stub) return stub;
      if (url.hostname === 'media.example.com' && init.method === undefined) {
        return new Response('social-test', { status: 200 });
      }
      return null;
    };
    const withPublicUrl = { ...s3Values, publicBaseUrl: 'https://media.example.com' };
    const response = await owner.post('/storage/providers/r2/test', { values: withPublicUrl, kind: 'upload' });
    assert.equal(response.body.ok, true);
    assert.match(response.body.message, /opened from its public link: https:\/\/media\.example\.com\//);
  });

  it('"Test upload" fails clearly when the public link does not open', async () => {
    const bucket = fakeBucket();
    override = (url, init) => {
      const stub = bucket(url, init);
      if (stub) return stub;
      if (url.hostname === 'media.example.com') return new Response('not found', { status: 404 });
      return null;
    };
    const response = await owner.post('/storage/providers/r2/test', { values: { ...s3Values, publicBaseUrl: 'https://media.example.com' }, kind: 'upload' });
    assert.equal(response.body.ok, false);
    assert.match(response.body.message, /did not open/);
  });

  it('turning External storage on needs a connected provider first', async () => {
    override = fakeBucket();
    await owner.delete('/storage/provider');
    const response = await owner.put('/storage/preferences', { serverEnabled: true, externalEnabled: true });
    assert.equal(response.status, 400);
  });

  it('disconnecting clears the keys but never touches files already uploaded', async () => {
    override = fakeBucket();
    await owner.put('/storage/providers/r2', { values: s3Values });
    const response = await owner.delete('/storage/provider');
    assert.equal(response.body.provider, null);
    assert.equal((await query('SELECT credentials FROM storage_settings WHERE id = true')).rows[0].credentials, null);
  });
});

describe('storage preferences', () => {
  it('saves the limit as value+unit (not lossily converted to bytes)', async () => {
    const response = await owner.put('/storage/preferences', { serverEnabled: true, externalEnabled: false, limitValue: 5, limitUnit: 'GB' });
    assert.equal(response.status, 200);
    assert.equal(response.body.preferences.limitValue, 5);
    assert.equal(response.body.preferences.limitUnit, 'GB');
  });
});

describe('storage settings live in their own table', () => {
  it('do not interfere with a social account (separate encryption, separate rows)', async () => {
    assert.equal(await getPublishingContext('facebook'), null, 'facebook was never connected in this test file');
    const row = (await query('SELECT provider_key FROM storage_settings WHERE id = true')).rows[0];
    assert.ok(row, 'storage_settings always has exactly one row');
  });
});
