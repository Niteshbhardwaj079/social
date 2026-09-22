import dns from 'node:dns/promises';
import net from 'node:net';
import { config } from '../config/env.js';
import { authFailure, rejection, unreachable } from './errors.js';

const MAX_BODY_BYTES = 1024 * 1024;

/**
 * The one way the API talks to a social platform: a hard time limit, a size limit, no redirects
 * followed (a platform never needs one for these calls), and every failure turned into a ProviderError.
 */
export async function callProvider(url, { method = 'GET', headers = {}, query, json, form, formData, bytes, bytesType, label }) {
  const target = new URL(url);
  for (const [key, value] of Object.entries(query || {})) if (value !== undefined) target.searchParams.set(key, value);

  const init = { method, headers: { accept: 'application/json', ...headers }, redirect: 'error', signal: AbortSignal.timeout(config.social.providerTimeoutMs) };
  if (json !== undefined) {
    init.body = JSON.stringify(json);
    init.headers['content-type'] = 'application/json; charset=UTF-8';
  } else if (form) {
    init.body = new URLSearchParams(form);
  } else if (formData) {
    init.body = formData; // fetch sets the multipart boundary itself from the FormData
  } else if (bytes) {
    init.body = bytes;
    init.headers['content-type'] = bytesType || 'application/octet-stream';
  }

  let response;
  let text;
  try {
    response = await fetch(target, init);
    text = await response.text();
  } catch {
    throw unreachable(`${label} did not answer. Check that this server can reach the internet, then try again.`);
  }
  if (text.length > MAX_BODY_BYTES) throw rejection(`${label} sent back an unexpectedly large answer.`);

  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    // not JSON — `data` stays null
  }
  return { status: response.status, ok: response.ok, data };
}

/** Pulls a short human message out of the many shapes platforms use for errors. */
function platformMessage(data) {
  const candidate = data?.error?.message ?? data?.error_description ?? data?.message ?? data?.detail ?? data?.error;
  return typeof candidate === 'string' ? candidate.replace(/\s+/g, ' ').trim().slice(0, 200) : '';
}

/**
 * A platform's own words for why it refused credentials only rarely say clearly which of "expired" or
 * "revoked" it means — most say one word for both (or neither). Only trust the platform's own text when
 * it is unambiguous; anything else stays the honest, generic "something is wrong with this credential".
 */
function authReason(detail) {
  if (!detail) return undefined;
  if (/revoked|revocation/i.test(detail)) return 'revoked';
  if (/expir/i.test(detail)) return 'token_expired';
  return undefined;
}

/** Turns a non-2xx answer into the right ProviderError. `hint` is extra advice for "credentials refused". */
export function failure(response, label, hint = '') {
  const detail = platformMessage(response.data);
  if (response.status === 401 || response.status === 403) {
    return authFailure(`${label} refused these credentials${detail ? ` (${detail})` : ''}.${hint ? ` ${hint}` : ''}`, authReason(detail));
  }
  if (response.status === 429) return unreachable(`${label} is limiting requests right now. Try again in a few minutes.`);
  if (response.status >= 500) return unreachable(`${label} is having trouble right now. Try again in a few minutes.`);
  return rejection(`${label} could not use this${detail ? `: ${detail}` : ` (error ${response.status})`}.`);
}

// ---------------------------------------------------------------- addresses typed in by the client
// Mastodon lives on whatever server the client names. Refuse anything that points inside a private
// network (this server's own network, cloud metadata...) so the field cannot be used to probe it.
const blocked = new net.BlockList();
[
  ['0.0.0.0', 8],
  ['10.0.0.0', 8],
  ['100.64.0.0', 10],
  ['127.0.0.0', 8],
  ['169.254.0.0', 16],
  ['172.16.0.0', 12],
  ['192.0.0.0', 24],
  ['192.168.0.0', 16],
  ['198.18.0.0', 15],
  ['224.0.0.0', 3],
].forEach(([address, prefix]) => blocked.addSubnet(address, prefix, 'ipv4'));
[
  ['::', 128],
  ['::1', 128],
  ['fc00::', 7],
  ['fe80::', 10],
  ['ff00::', 8],
].forEach(([address, prefix]) => blocked.addSubnet(address, prefix, 'ipv6'));

function isPrivateAddress(address) {
  const mapped = address.toLowerCase().match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  const plain = mapped ? mapped[1] : address;
  return blocked.check(plain, net.isIPv6(plain) ? 'ipv6' : 'ipv4');
}

/**
 * Checks a URL someone typed in is a plain public address before this server ever fetches it — otherwise it
 * could be pointed at this server's own network or a cloud metadata address (SSRF). Returns the origin.
 */
export async function assertPublicOrigin(raw, { requireHttps = true } = {}) {
  let url;
  try {
    url = new URL(String(raw).trim());
  } catch {
    throw rejection(requireHttps ? 'That address must be a full https:// address, for example https://mastodon.social.' : 'That does not look like a full web address.');
  }
  const okProtocol = requireHttps ? url.protocol === 'https:' : url.protocol === 'https:' || url.protocol === 'http:';
  if (!okProtocol || url.username || url.password) {
    throw rejection(requireHttps ? 'That address must be a plain https:// address, for example https://mastodon.social.' : 'That address must be a plain http:// or https:// address.');
  }
  const host = url.hostname.replace(/^\[|\]$/g, '');
  let addresses;
  try {
    addresses = net.isIP(host) ? [host] : (await dns.lookup(host, { all: true })).map((entry) => entry.address);
  } catch {
    throw rejection(`${url.hostname} could not be found. Check the address.`);
  }
  if (!addresses.length || addresses.some(isPrivateAddress)) {
    throw rejection('That address points to a private network, which is not allowed.');
  }
  return url.origin;
}

/** Same check, but only https:// is accepted — used where an admin is naming server infrastructure. */
export const assertPublicHttpsOrigin = (raw) => assertPublicOrigin(raw, { requireHttps: true });
