import crypto from 'node:crypto';
import { config } from '../config/env.js';
import { callProvider, failure } from './http.js';
import { authFailure, rejection } from './errors.js';

/** Facebook Pages, Instagram Business and Threads: all three are Meta's Graph API. */
const graphBase = () => `https://graph.facebook.com/${config.social.metaGraphVersion}`;
const THREADS_BASE = 'https://graph.threads.net/v1.0';

// Meta answers an expired or revoked token with HTTP 400 and error code 190 rather than 401.
const isTokenProblem = (response) => response.data?.error?.code === 190 || response.data?.error?.type === 'OAuthException';

async function graphGet(base, path, { label, token, appSecret, fields }) {
  const query = { fields };
  // Apps that require it reject calls without a proof that the caller knows the App Secret.
  if (appSecret) query.appsecret_proof = crypto.createHmac('sha256', appSecret).update(token).digest('hex');
  const response = await callProvider(`${base}/${path}`, { headers: { authorization: `Bearer ${token}` }, query, label });
  if (response.ok) return response.data;
  if (isTokenProblem(response)) {
    throw authFailure(`${label} says this access token is invalid or has expired. Generate a new long-lived token and try again.`);
  }
  throw failure(response, label);
}

/** Confirms the token is alive AND was issued by the App ID given, so a mismatched pair is caught here. */
async function assertTokenBelongsToApp(label, { appId, appSecret, accessToken }) {
  const response = await callProvider(`${graphBase()}/debug_token`, {
    query: { input_token: accessToken, access_token: `${appId}|${appSecret}` },
    label,
  });
  // Any non-2xx here used to be treated as "these credentials are bad" unconditionally — including a
  // plain 503/429 from Meta itself, which would have wrongly flagged a perfectly good account. Route it
  // through the same classifier graphGet() already uses below, so only a real 401/403 counts as auth.
  if (!response.ok) throw failure(response, label, 'Copy the App ID and App Secret again from App settings → Basic.');
  const info = response.data?.data;
  if (!info?.is_valid) throw authFailure(`${label} says this access token is invalid or has expired. Generate a new long-lived token and try again.`);
  if (String(info.app_id) !== String(appId)) throw rejection('This access token was created by a different app than the App ID you entered.');
}

export async function verifyFacebook(credentials) {
  await assertTokenBelongsToApp('Facebook', credentials);
  const data = await graphGet(graphBase(), 'me', {
    label: 'Facebook',
    token: credentials.accessToken,
    appSecret: credentials.appSecret,
    fields: 'id,name,followers_count,fan_count',
  });
  return { externalId: data.id, accountName: data.name, handle: '', followers: data.followers_count ?? data.fan_count ?? null };
}

export async function verifyInstagram(credentials) {
  await assertTokenBelongsToApp('Instagram', credentials);
  const data = await graphGet(graphBase(), encodeURIComponent(credentials.igUserId), {
    label: 'Instagram',
    token: credentials.accessToken,
    appSecret: credentials.appSecret,
    fields: 'id,username,name,followers_count',
  });
  return {
    externalId: data.id,
    accountName: data.name || data.username,
    handle: data.username ? `@${data.username}` : '',
    followers: data.followers_count ?? null,
  };
}

export async function verifyThreads(credentials) {
  const data = await graphGet(THREADS_BASE, 'me', { label: 'Threads', token: credentials.accessToken, fields: 'id,username,name' });
  if (String(data.id) !== String(credentials.threadsUserId)) {
    throw rejection('This access token belongs to a different Threads account than the Threads User ID you entered.');
  }
  return { externalId: data.id, accountName: data.name || data.username, handle: data.username ? `@${data.username}` : '', followers: null };
}
