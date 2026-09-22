import { assertPublicHttpsOrigin, callProvider, failure } from './http.js';
import { authFailure, rejection } from './errors.js';

// ---------------------------------------------------------------- Pinterest
export async function verifyPinterest({ accessToken }) {
  const response = await callProvider('https://api.pinterest.com/v5/user_account', {
    headers: { authorization: `Bearer ${accessToken}` },
    label: 'Pinterest',
  });
  if (!response.ok) throw failure(response, 'Pinterest', 'Check that the token was generated with the boards:read and pins:write scopes.');
  const account = response.data;
  if (!account?.username) throw rejection('Pinterest did not return an account for this token.');
  return {
    externalId: String(account.id || account.username),
    accountName: account.business_name || account.username,
    handle: account.username,
    followers: Number.isFinite(account.follower_count) ? account.follower_count : null,
  };
}

/** Every board this account can pin to — a Pin always needs one, chosen per post in the composer. */
export async function listPinterestBoards({ accessToken }) {
  const response = await callProvider('https://api.pinterest.com/v5/boards', {
    query: { page_size: '100' },
    headers: { authorization: `Bearer ${accessToken}` },
    label: 'Pinterest',
  });
  if (!response.ok) throw failure(response, 'Pinterest', 'Check that the token has the boards:read scope.');
  return (response.data?.items || []).map((board) => ({ id: String(board.id), name: board.name || 'Untitled board' }));
}

// ---------------------------------------------------------------- TikTok
// "creator info" only needs the video.publish scope this connection is for, unlike the profile endpoint.
export async function verifyTikTok({ accessToken }) {
  const response = await callProvider('https://open.tiktokapis.com/v2/post/publish/creator_info/query/', {
    method: 'POST',
    headers: { authorization: `Bearer ${accessToken}` },
    json: {},
    label: 'TikTok',
  });
  const code = response.data?.error?.code;
  if (!response.ok && response.status !== 400) throw failure(response, 'TikTok');
  if (code && code !== 'ok') {
    if (/token|scope|auth/i.test(code)) throw authFailure('TikTok refused this access token. Authorize again with the video.publish scope.');
    throw rejection(`TikTok could not use this token (${String(code).slice(0, 60)}).`);
  }
  const creator = response.data?.data;
  if (!creator) throw rejection('TikTok did not return an account for this token.');
  return {
    externalId: creator.creator_username || '',
    accountName: creator.creator_nickname || creator.creator_username || 'TikTok account',
    handle: creator.creator_username ? `@${creator.creator_username}` : '',
    followers: null,
  };
}

// ---------------------------------------------------------------- Mastodon
export async function verifyMastodon({ instanceUrl, accessToken }) {
  const origin = await assertPublicHttpsOrigin(instanceUrl);
  const response = await callProvider(`${origin}/api/v1/accounts/verify_credentials`, {
    headers: { authorization: `Bearer ${accessToken}` },
    label: new URL(origin).hostname,
  });
  if (!response.ok) throw failure(response, new URL(origin).hostname, 'Check that the token has the write:statuses scope.');
  const account = response.data;
  if (!account?.id) throw rejection(`${new URL(origin).hostname} does not look like a Mastodon server.`);
  return {
    externalId: String(account.id),
    accountName: account.display_name || account.username,
    handle: `@${account.acct?.includes('@') ? account.acct : `${account.acct}@${new URL(origin).hostname}`}`,
    followers: Number.isFinite(account.followers_count) ? account.followers_count : null,
  };
}

// ---------------------------------------------------------------- Bluesky
const APP_PASSWORD = /^[a-z0-9]{4}(-[a-z0-9]{4}){3}$/i;
const BLUESKY = 'https://bsky.social/xrpc';

export async function verifyBluesky({ handle, appPassword }) {
  // A normal account password must never be typed here — an App Password can be revoked, a real one cannot.
  if (!APP_PASSWORD.test(appPassword.trim())) {
    throw rejection('That does not look like an App Password (it is four groups like xxxx-xxxx-xxxx-xxxx). Create one in Bluesky → Settings → Privacy and security → App passwords — never use your real password.');
  }
  const identifier = handle.trim().replace(/^@/, '');
  const session = await callProvider(`${BLUESKY}/com.atproto.server.createSession`, {
    method: 'POST',
    json: { identifier, password: appPassword.trim() },
    label: 'Bluesky',
  });
  if (session.status === 401 || session.status === 400) {
    throw authFailure('Bluesky did not accept this handle and App Password. Check the handle (for example you.bsky.social) and create a fresh App Password.');
  }
  if (!session.ok || !session.data?.accessJwt) throw failure(session, 'Bluesky');

  const profile = await callProvider(`${BLUESKY}/app.bsky.actor.getProfile`, {
    headers: { authorization: `Bearer ${session.data.accessJwt}` },
    query: { actor: session.data.did },
    label: 'Bluesky',
  });
  const data = profile.ok ? profile.data : null;
  return {
    externalId: session.data.did,
    accountName: data?.displayName || session.data.handle,
    handle: `@${session.data.handle}`,
    followers: Number.isFinite(data?.followersCount) ? data.followersCount : null,
  };
}
