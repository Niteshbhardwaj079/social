import crypto from 'node:crypto';
import { config } from '../config/env.js';
import { assertPublicHttpsOrigin, callProvider, failure } from './http.js';
import { oauth1Header } from './oauth1.js';
import { authFailure, rejection, unreachable } from './errors.js';
import { accessTokenFor as googleAccessTokenFor } from './google.js';
// A providers/ file reaching into services/ runs against the usual direction (services call providers), but
// there is no cycle — mediaService never imports this file — and it is the one place a byte-upload platform
// needs an attached file's actual bytes, wherever they really live (our storage, or someone else's URL).
import { readMediaBytes } from '../services/mediaService.js';

/**
 * Sending one text post to one platform. Each function gets
 *   { credentials, account: { externalId, handle }, text, key, media }
 * (`key` is stable for this post+platform, used as an idempotency key where the platform supports one;
 * `media` is the first attached image's media_items row, or null) and resolves to { externalId, url } or
 * throws a ProviderError.
 */
const bearer = (token) => ({ authorization: `Bearer ${token}` });

// ---------------------------------------------------------------- Bluesky
const BLUESKY = 'https://bsky.social/xrpc';
const utf8Length = (text) => Buffer.byteLength(text, 'utf8');

/** Links and #hashtags only become clickable when the post says where they are (in UTF-8 bytes). */
export function blueskyFacets(text) {
  const facets = [];
  const add = (start, end, feature) => {
    const byteStart = utf8Length(text.slice(0, start));
    facets.push({ index: { byteStart, byteEnd: byteStart + utf8Length(text.slice(start, end)) }, features: [feature] });
  };
  for (const match of text.matchAll(/https?:\/\/[^\s]+/g)) {
    const link = match[0].replace(/[.,;:!?)\]}'"]+$/, '');
    add(match.index, match.index + link.length, { $type: 'app.bsky.richtext.facet#link', uri: link });
  }
  for (const match of text.matchAll(/(?<=^|\s)#([^\s#\d][^\s#]*)/g)) {
    const tag = match[1].replace(/[.,;:!?)\]}'"]+$/, '');
    if (tag) add(match.index, match.index + 1 + tag.length, { $type: 'app.bsky.richtext.facet#tag', tag });
  }
  return facets;
}

async function uploadBlueskyImage(accessJwt, media) {
  const bytes = await readMediaBytes(media);
  const uploaded = await callProvider(`${BLUESKY}/com.atproto.repo.uploadBlob`, {
    method: 'POST',
    headers: bearer(accessJwt),
    bytes,
    bytesType: media.content_type,
    label: 'Bluesky',
  });
  if (!uploaded.ok || !uploaded.data?.blob) throw failure(uploaded, 'Bluesky', 'Could not upload the attached image.');
  return uploaded.data.blob;
}

async function publishBluesky({ credentials, text, media }) {
  const session = await callProvider(`${BLUESKY}/com.atproto.server.createSession`, {
    method: 'POST',
    json: { identifier: credentials.handle.replace(/^@/, ''), password: credentials.appPassword },
    label: 'Bluesky',
  });
  if (session.status === 400 || session.status === 401) throw authFailure('Bluesky did not accept the saved App Password. Connect the account again.');
  if (!session.ok || !session.data?.accessJwt) throw failure(session, 'Bluesky');

  const embed = media ? { $type: 'app.bsky.embed.images', images: [{ image: await uploadBlueskyImage(session.data.accessJwt, media), alt: media.name || '' }] } : undefined;
  const facets = blueskyFacets(text);
  const created = await callProvider(`${BLUESKY}/com.atproto.repo.createRecord`, {
    method: 'POST',
    headers: bearer(session.data.accessJwt),
    json: {
      repo: session.data.did,
      collection: 'app.bsky.feed.post',
      record: { $type: 'app.bsky.feed.post', text, createdAt: new Date().toISOString(), ...(facets.length ? { facets } : {}), ...(embed ? { embed } : {}) },
    },
    label: 'Bluesky',
  });
  if (!created.ok || !created.data?.uri) throw failure(created, 'Bluesky');
  const rkey = created.data.uri.split('/').pop();
  return { externalId: created.data.uri, url: `https://bsky.app/profile/${session.data.handle}/post/${rkey}` };
}

// ---------------------------------------------------------------- Mastodon
async function uploadMastodonMedia(origin, host, credentials, media) {
  const bytes = await readMediaBytes(media);
  const form = new FormData();
  form.append('file', new Blob([bytes], { type: media.content_type }), media.name || 'file');
  const uploaded = await callProvider(`${origin}/api/v2/media`, { method: 'POST', headers: bearer(credentials.accessToken), formData: form, label: host });
  if ((!uploaded.ok && uploaded.status !== 202) || !uploaded.data?.id) throw failure(uploaded, host, 'Could not upload the attached file.');
  return uploaded.data.id;
}

async function publishMastodon({ credentials, text, key, media }) {
  const origin = await assertPublicHttpsOrigin(credentials.instanceUrl);
  const host = new URL(origin).hostname;
  const mediaId = media ? await uploadMastodonMedia(origin, host, credentials, media) : null;
  const response = await callProvider(`${origin}/api/v1/statuses`, {
    method: 'POST',
    // The server ignores a repeat of the same key, so a retried request can never post twice.
    headers: { ...bearer(credentials.accessToken), 'idempotency-key': key },
    json: { status: text, visibility: 'public', ...(mediaId ? { media_ids: [mediaId] } : {}) },
    label: host,
  });
  if (!response.ok) throw failure(response, host, 'Check that the token has the write:statuses scope.');
  if (!response.data?.id) throw rejection(`${host} accepted the post but did not say where it went.`);
  return { externalId: String(response.data.id), url: response.data.url || null };
}

// ---------------------------------------------------------------- X
const TWEETS_URL = 'https://api.x.com/2/tweets';
const MEDIA_UPLOAD_URL = 'https://upload.twitter.com/1.1/media/upload.json';

function xOAuth1({ method, url, params, credentials }) {
  return oauth1Header({
    method,
    url,
    params,
    consumerKey: credentials.apiKey,
    consumerSecret: credentials.apiSecret,
    token: credentials.accessToken,
    tokenSecret: credentials.accessTokenSecret,
  });
}

// The classic v1.1 upload endpoint, still what v2 tweets reference by id. A multipart file field is not
// part of the OAuth 1.0a signature base — only the URL and any plain form fields are (there are none here).
async function uploadXMedia(credentials, media) {
  const bytes = await readMediaBytes(media);
  const authorization = xOAuth1({ method: 'POST', url: MEDIA_UPLOAD_URL, params: {}, credentials });
  const form = new FormData();
  form.append('media', new Blob([bytes], { type: media.content_type }), media.name || 'file');
  const uploaded = await callProvider(MEDIA_UPLOAD_URL, { method: 'POST', headers: { authorization }, formData: form, label: 'X' });
  if (!uploaded.ok || !uploaded.data?.media_id_string) throw failure(uploaded, 'X', 'Could not upload the attached image.');
  return uploaded.data.media_id_string;
}

async function publishX({ credentials, text, media }) {
  const mediaId = media ? await uploadXMedia(credentials, media) : null;
  const authorization = xOAuth1({ method: 'POST', url: TWEETS_URL, params: {}, credentials }); // a JSON body is not part of an OAuth 1.0a signature
  const response = await callProvider(TWEETS_URL, {
    method: 'POST',
    headers: { authorization },
    json: mediaId ? { text, media: { media_ids: [mediaId] } } : { text },
    label: 'X',
  });
  if (!response.ok) throw failure(response, 'X', 'The Access Token needs Read and Write permission.');
  const id = response.data?.data?.id;
  if (!id) throw rejection('X accepted the post but did not say where it went.');
  return { externalId: id, url: `https://x.com/i/status/${id}` };
}

// ---------------------------------------------------------------- Threads
const THREADS = 'https://graph.threads.net/v1.0';

async function publishThreads({ credentials, text, media }) {
  const userId = encodeURIComponent(credentials.threadsUserId);
  const container = await callProvider(`${THREADS}/${userId}/threads`, {
    method: 'POST',
    headers: bearer(credentials.accessToken),
    form: media ? { media_type: 'IMAGE', image_url: media.public_url, text } : { media_type: 'TEXT', text },
    label: 'Threads',
  });
  if (!container.ok || !container.data?.id) throw failure(container, 'Threads', 'The token needs the threads_content_publish permission.');

  const published = await callProvider(`${THREADS}/${userId}/threads_publish`, {
    method: 'POST',
    headers: bearer(credentials.accessToken),
    form: { creation_id: container.data.id },
    label: 'Threads',
  });
  if (!published.ok || !published.data?.id) throw failure(published, 'Threads');

  // The link is a nicety: the post is already live even if this lookup fails.
  let url = null;
  try {
    const details = await callProvider(`${THREADS}/${encodeURIComponent(published.data.id)}`, { headers: bearer(credentials.accessToken), query: { fields: 'permalink' }, label: 'Threads' });
    url = details.ok ? details.data?.permalink || null : null;
  } catch {
    // no link
  }
  return { externalId: String(published.data.id), url };
}

// ---------------------------------------------------------------- Facebook Pages
async function publishFacebook({ credentials, account, text, media }) {
  const proof = crypto.createHmac('sha256', credentials.appSecret).update(credentials.accessToken).digest('hex');
  const edge = media ? 'photos' : 'feed';
  const form = media ? { url: media.public_url, caption: text, appsecret_proof: proof } : { message: text, appsecret_proof: proof };
  const response = await callProvider(`https://graph.facebook.com/${config.social.metaGraphVersion}/${encodeURIComponent(account.externalId)}/${edge}`, {
    method: 'POST',
    headers: bearer(credentials.accessToken),
    form,
    label: 'Facebook',
  });
  if (response.data?.error?.code === 190) throw authFailure('Facebook says the saved token has expired. Connect the account again with a new token.');
  if (!response.ok) throw failure(response, 'Facebook', 'The token needs the pages_manage_posts permission.');
  const id = response.data?.post_id || response.data?.id;
  if (!id) throw rejection('Facebook accepted the post but did not say where it went.');
  return { externalId: id, url: `https://www.facebook.com/${id}` };
}

// ---------------------------------------------------------------- Instagram Business
async function publishInstagram({ credentials, text, media }) {
  if (!media) throw rejection('Instagram needs an image attached to post.');
  const userId = encodeURIComponent(credentials.igUserId);
  const container = await callProvider(`https://graph.facebook.com/${config.social.metaGraphVersion}/${userId}/media`, {
    method: 'POST',
    headers: bearer(credentials.accessToken),
    form: { image_url: media.public_url, caption: text },
    label: 'Instagram',
  });
  if (!container.ok || !container.data?.id) throw failure(container, 'Instagram', 'The token needs the instagram_content_publish permission.');

  const published = await callProvider(`https://graph.facebook.com/${config.social.metaGraphVersion}/${userId}/media_publish`, {
    method: 'POST',
    headers: bearer(credentials.accessToken),
    form: { creation_id: container.data.id },
    label: 'Instagram',
  });
  if (!published.ok || !published.data?.id) throw failure(published, 'Instagram');
  return { externalId: published.data.id, url: null };
}

// ---------------------------------------------------------------- Pinterest
async function publishPinterest({ credentials, text, media, boardId }) {
  if (!media) throw rejection('Pinterest needs an image attached to post.');
  if (!boardId) throw rejection('Choose a Pinterest board for this post.');
  const response = await callProvider('https://api.pinterest.com/v5/pins', {
    method: 'POST',
    headers: bearer(credentials.accessToken),
    json: { board_id: boardId, media_source: { source_type: 'image_url', url: media.public_url }, description: text.slice(0, 800) },
    label: 'Pinterest',
  });
  if (!response.ok) throw failure(response, 'Pinterest', 'The token needs the pins:write scope, and the board must belong to this account.');
  if (!response.data?.id) throw rejection('Pinterest accepted the pin but did not say where it went.');
  return { externalId: String(response.data.id), url: `https://www.pinterest.com/pin/${response.data.id}/` };
}

// ---------------------------------------------------------------- LinkedIn
const linkedinHeaders = (token) => ({ ...bearer(token), 'x-restli-protocol-version': '2.0.0' });

/** LinkedIn's three-step image flow: reserve an upload slot, PUT the bytes there, then reference the asset. */
async function uploadLinkedInImage(credentials, author, media) {
  const registered = await callProvider('https://api.linkedin.com/v2/assets?action=registerUpload', {
    method: 'POST',
    headers: linkedinHeaders(credentials.accessToken),
    json: {
      registerUploadRequest: {
        recipes: ['urn:li:digitalmediaRecipe:feedshare-image'],
        owner: author,
        serviceRelationships: [{ relationshipType: 'OWNER', identifier: 'urn:li:userGeneratedContent' }],
      },
    },
    label: 'LinkedIn',
  });
  const uploadUrl = registered.data?.value?.uploadMechanism?.['com.linkedin.digitalmedia.uploading.MediaUploadHttpRequest']?.uploadUrl;
  const asset = registered.data?.value?.asset;
  if (!registered.ok || !uploadUrl || !asset) throw failure(registered, 'LinkedIn', 'The token needs the w_member_social or w_organization_social permission.');

  const bytes = await readMediaBytes(media);
  const uploaded = await callProvider(uploadUrl, { method: 'PUT', headers: bearer(credentials.accessToken), bytes, bytesType: media.content_type, label: 'LinkedIn' });
  if (!uploaded.ok) throw failure(uploaded, 'LinkedIn', 'Could not upload the attached image.');
  return asset;
}

async function publishToLinkedIn({ credentials, author, text, media }) {
  const asset = media ? await uploadLinkedInImage(credentials, author, media) : null;
  const response = await callProvider('https://api.linkedin.com/v2/ugcPosts', {
    method: 'POST',
    headers: linkedinHeaders(credentials.accessToken),
    json: {
      author,
      lifecycleState: 'PUBLISHED',
      specificContent: {
        'com.linkedin.ugc.ShareContent': {
          shareCommentary: { text },
          shareMediaCategory: asset ? 'IMAGE' : 'NONE',
          ...(asset ? { media: [{ status: 'READY', media: asset }] } : {}),
        },
      },
      visibility: { 'com.linkedin.ugc.MemberNetworkVisibility': 'PUBLIC' },
    },
    label: 'LinkedIn',
  });
  if (!response.ok) throw failure(response, 'LinkedIn', 'The token needs the w_member_social (profile) or w_organization_social (Page) permission.');
  const id = response.data?.id;
  if (!id) throw rejection('LinkedIn accepted the post but did not say where it went.');
  return { externalId: id, url: `https://www.linkedin.com/feed/update/${id}` };
}

const publishLinkedIn = (input) => publishToLinkedIn({ ...input, author: `urn:li:person:${input.account.externalId}` });
const publishLinkedInCompany = (input) => publishToLinkedIn({ ...input, author: `urn:li:organization:${input.credentials.organizationId}` });

// ---------------------------------------------------------------- TikTok
// Until the app is audited by TikTok, a post can only be private (visible to the poster only) — see the
// caution already shown on the connect page. This is a TikTok rule, not a choice made here.
async function publishTikTok({ credentials, text, media }) {
  if (!media) throw rejection('TikTok needs a video attached to post.');
  const response = await callProvider('https://open.tiktokapis.com/v2/post/publish/video/init/', {
    method: 'POST',
    headers: bearer(credentials.accessToken),
    json: {
      post_info: { title: text, privacy_level: 'SELF_ONLY', disable_duet: false, disable_comment: false, disable_stitch: false },
      // TikTok fetches the file itself — the URL's domain must be verified in the app's TikTok developer settings first.
      source_info: { source: 'PULL_FROM_URL', video_url: media.public_url },
    },
    label: 'TikTok',
  });
  const errorCode = response.data?.error?.code;
  if (!response.ok || (errorCode && errorCode !== 'ok')) {
    if (errorCode && /url_ownership|domain/i.test(errorCode)) {
      throw rejection(`TikTok refused this video's address. Verify ${new URL(media.public_url).hostname} under this app's TikTok developer settings first.`);
    }
    throw failure(response, 'TikTok', 'Check that the token has the video.publish scope.');
  }
  const publishId = response.data?.data?.publish_id;
  if (!publishId) throw rejection('TikTok accepted the request but did not say where it went.');
  // PULL_FROM_URL fetches and processes the video after this call returns, so there is no post link yet.
  return { externalId: publishId, url: null };
}

// ---------------------------------------------------------------- YouTube
const YOUTUBE_UPLOAD = 'https://www.googleapis.com/upload/youtube/v3/videos';

async function googleFetch(url, init) {
  try {
    return await fetch(url, { ...init, redirect: 'error', signal: AbortSignal.timeout(config.social.providerTimeoutMs) });
  } catch {
    throw unreachable('YouTube did not answer. Check that this server can reach the internet, then try again.');
  }
}

async function publishYouTube({ credentials, text, media }) {
  if (!media) throw rejection('YouTube needs a video attached to post.');
  const token = await googleAccessTokenFor(credentials);
  const bytes = await readMediaBytes(media);
  const title = (text.split('\n')[0] || 'New video').slice(0, 100);

  const started = await googleFetch(`${YOUTUBE_UPLOAD}?uploadType=resumable&part=snippet,status`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${token}`,
      'content-type': 'application/json; charset=UTF-8',
      'x-upload-content-type': media.content_type,
      'x-upload-content-length': String(bytes.length),
    },
    body: JSON.stringify({ snippet: { title, description: text.slice(0, 5000) }, status: { privacyStatus: 'public' } }),
  });
  if (!started.ok) throw failure({ status: started.status, ok: false, data: await started.json().catch(() => null) }, 'YouTube', 'Check that YouTube Data API v3 is enabled and the token has the youtube.upload scope.');
  const uploadUrl = started.headers.get('location');
  if (!uploadUrl) throw rejection('YouTube did not say where to send the video.');

  const uploaded = await googleFetch(uploadUrl, { method: 'PUT', headers: { authorization: `Bearer ${token}`, 'content-type': media.content_type }, body: bytes });
  const data = await uploaded.json().catch(() => null);
  if (!uploaded.ok || !data?.id) throw failure({ status: uploaded.status, ok: uploaded.ok, data }, 'YouTube');
  return { externalId: data.id, url: `https://www.youtube.com/watch?v=${data.id}` };
}

export const PUBLISHERS = {
  bluesky: publishBluesky,
  mastodon: publishMastodon,
  x: publishX,
  threads: publishThreads,
  facebook: publishFacebook,
  instagram: publishInstagram,
  pinterest: publishPinterest,
  linkedin: publishLinkedIn,
  linkedinCompany: publishLinkedInCompany,
  tiktok: publishTikTok,
  youtube: publishYouTube,
};
