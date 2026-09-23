import { config } from '../config/env.js';
import { callProvider, failure } from './http.js';
import { rejection } from './errors.js';
import { graphGet } from './meta.js';
import { accessTokenFor as googleAccessTokenFor } from './google.js';

/**
 * Reading real comments on a real published post, and sending a real reply back — for the same 5
 * platforms (of the 6 metrics.js supports) confident enough to list actual comment text/author, not just
 * a count. `listComments(platform, {credentials, externalId})` resolves to an array of
 * `{externalCommentId, authorName, authorHandle?, authorExternalId?, authorFollowers?, authorFollowing?,
 * authorPostsCount?, authorVerified?, authorJoinedAt?, authorBio?, authorProfileUrl?, text, createdAt, meta}`
 * — any field the platform's comment payload didn't actually include is left undefined, never guessed.
 * `postReply(platform, {credentials, externalCommentId, text, meta, rootExternalId})` resolves to
 * `{externalReplyId}`.
 *
 * X is not here: metrics.js already found X's comment/reply LISTING has no reliable free-tier endpoint
 * (the documented approach is a search query needing an elevated access tier this app's BYOK users may not
 * have) — posting a reply alone, with nothing to reply *to* in the Inbox, is not a useful half-feature, so
 * X is skipped entirely rather than guessed. Threads/LinkedIn/TikTok/Pinterest/Google Business: same
 * reasoning as metrics.js and Google Business posting — not attempted without confident, verified knowledge.
 */

const bearer = (token) => ({ authorization: `Bearer ${token}` });
const stripHtml = (html) =>
  (html || '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();

// ---------------------------------------------------------------- Bluesky
const BLUESKY = 'https://bsky.social/xrpc';
const BLUESKY_PUBLIC = 'https://public.api.bsky.app/xrpc';

async function listBlueskyComments({ externalId }) {
  const response = await callProvider(`${BLUESKY_PUBLIC}/app.bsky.feed.getPostThread`, { query: { uri: externalId, depth: 1 }, label: 'Bluesky' });
  if (!response.ok) throw failure(response, 'Bluesky');
  const replies = response.data?.thread?.replies || [];
  return replies
    .filter((node) => node.post?.record?.text !== undefined)
    .map((node) => ({
      externalCommentId: node.post.uri,
      authorName: node.post.author?.displayName || node.post.author?.handle || 'Bluesky user',
      authorHandle: node.post.author?.handle ? `@${node.post.author.handle}` : undefined,
      authorExternalId: node.post.author?.did,
      text: node.post.record.text,
      createdAt: node.post.record.createdAt || node.post.indexedAt,
      meta: { cid: node.post.cid },
    }));
}

async function postBlueskyReply({ credentials, externalCommentId, text, meta, rootExternalId }) {
  const session = await callProvider(`${BLUESKY}/com.atproto.server.createSession`, {
    method: 'POST',
    json: { identifier: credentials.handle.replace(/^@/, ''), password: credentials.appPassword },
    label: 'Bluesky',
  });
  if (!session.ok || !session.data?.accessJwt) throw failure(session, 'Bluesky');

  const rootThread = await callProvider(`${BLUESKY_PUBLIC}/app.bsky.feed.getPostThread`, { query: { uri: rootExternalId, depth: 0 }, label: 'Bluesky' });
  const rootCid = rootThread.data?.thread?.post?.cid;
  if (!rootThread.ok || !rootCid) throw rejection('Could not find the original Bluesky post to reply under (it may have been deleted).');
  const parentCid = meta?.cid;
  if (!parentCid) throw rejection('Missing the saved reference needed to reply to this Bluesky comment.');

  const created = await callProvider(`${BLUESKY}/com.atproto.repo.createRecord`, {
    method: 'POST',
    headers: bearer(session.data.accessJwt),
    json: {
      repo: session.data.did,
      collection: 'app.bsky.feed.post',
      record: {
        $type: 'app.bsky.feed.post',
        text,
        createdAt: new Date().toISOString(),
        reply: { root: { uri: rootExternalId, cid: rootCid }, parent: { uri: externalCommentId, cid: parentCid } },
      },
    },
    label: 'Bluesky',
  });
  if (!created.ok || !created.data?.uri) throw failure(created, 'Bluesky');
  return { externalReplyId: created.data.uri };
}

// ---------------------------------------------------------------- Mastodon
async function listMastodonComments({ credentials, externalId }) {
  const origin = credentials.instanceUrl.replace(/\/+$/, '');
  const response = await callProvider(`${origin}/api/v1/statuses/${encodeURIComponent(externalId)}/context`, {
    headers: bearer(credentials.accessToken),
    label: 'Mastodon',
  });
  if (!response.ok) throw failure(response, 'Mastodon');
  return (response.data?.descendants || []).map((status) => ({
    externalCommentId: String(status.id),
    authorName: status.account?.display_name || status.account?.username || 'Mastodon user',
    authorHandle: status.account?.username ? `@${status.account.username}` : undefined,
    authorExternalId: status.account?.id !== undefined ? String(status.account.id) : undefined,
    authorFollowers: status.account?.followers_count,
    authorFollowing: status.account?.following_count,
    authorPostsCount: status.account?.statuses_count,
    authorJoinedAt: status.account?.created_at,
    authorBio: status.account?.note ? stripHtml(status.account.note) : undefined,
    authorProfileUrl: status.account?.url,
    text: stripHtml(status.content),
    createdAt: status.created_at,
    meta: {},
  }));
}

async function postMastodonReply({ credentials, externalCommentId, text }) {
  const origin = credentials.instanceUrl.replace(/\/+$/, '');
  const response = await callProvider(`${origin}/api/v1/statuses`, {
    method: 'POST',
    headers: bearer(credentials.accessToken),
    json: { status: text, in_reply_to_id: externalCommentId, visibility: 'public' },
    label: 'Mastodon',
  });
  if (!response.ok) throw failure(response, 'Mastodon');
  return { externalReplyId: response.data?.id !== undefined ? String(response.data.id) : undefined };
}

// ---------------------------------------------------------------- Facebook Pages
async function listFacebookComments({ credentials, externalId }) {
  const data = await graphGet(`https://graph.facebook.com/${config.social.metaGraphVersion}`, `${encodeURIComponent(externalId)}/comments`, {
    label: 'Facebook',
    token: credentials.accessToken,
    appSecret: credentials.appSecret,
    fields: 'id,message,from,created_time',
  });
  return (data.data || []).map((comment) => ({
    externalCommentId: comment.id,
    authorName: comment.from?.name || 'Facebook user',
    authorExternalId: comment.from?.id,
    text: comment.message || '',
    createdAt: comment.created_time,
    meta: {},
  }));
}

async function postFacebookReply({ credentials, externalCommentId, text }) {
  const response = await callProvider(`https://graph.facebook.com/${config.social.metaGraphVersion}/${encodeURIComponent(externalCommentId)}/comments`, {
    method: 'POST',
    headers: bearer(credentials.accessToken),
    form: { message: text },
    label: 'Facebook',
  });
  if (!response.ok) throw failure(response, 'Facebook');
  return { externalReplyId: response.data?.id };
}

// ---------------------------------------------------------------- Instagram Business
async function listInstagramComments({ credentials, externalId }) {
  const data = await graphGet(`https://graph.facebook.com/${config.social.metaGraphVersion}`, `${encodeURIComponent(externalId)}/comments`, {
    label: 'Instagram',
    token: credentials.accessToken,
    appSecret: credentials.appSecret,
    fields: 'id,text,username,timestamp',
  });
  return (data.data || []).map((comment) => ({
    externalCommentId: comment.id,
    authorName: comment.username || 'Instagram user',
    authorHandle: comment.username ? `@${comment.username}` : undefined,
    text: comment.text || '',
    createdAt: comment.timestamp,
    meta: {},
  }));
}

async function postInstagramReply({ credentials, externalCommentId, text }) {
  const response = await callProvider(`https://graph.facebook.com/${config.social.metaGraphVersion}/${encodeURIComponent(externalCommentId)}/replies`, {
    method: 'POST',
    headers: bearer(credentials.accessToken),
    form: { message: text },
    label: 'Instagram',
  });
  if (!response.ok) throw failure(response, 'Instagram');
  return { externalReplyId: response.data?.id };
}

// ---------------------------------------------------------------- YouTube
async function listYouTubeComments({ credentials, externalId }) {
  const token = await googleAccessTokenFor(credentials);
  const response = await callProvider('https://www.googleapis.com/youtube/v3/commentThreads', {
    headers: bearer(token),
    query: { part: 'snippet', videoId: externalId, textFormat: 'plainText', maxResults: 50 },
    label: 'YouTube',
  });
  if (!response.ok) throw failure(response, 'YouTube');
  return (response.data?.items || [])
    .filter((item) => item.snippet?.topLevelComment?.snippet)
    .map((item) => {
      const snippet = item.snippet.topLevelComment.snippet;
      return {
        externalCommentId: item.snippet.topLevelComment.id,
        authorName: snippet.authorDisplayName || 'YouTube user',
        authorExternalId: snippet.authorChannelId?.value,
        authorProfileUrl: snippet.authorChannelUrl,
        text: snippet.textDisplay || '',
        createdAt: snippet.publishedAt,
        meta: {},
      };
    });
}

async function postYouTubeReply({ credentials, externalCommentId, text }) {
  const token = await googleAccessTokenFor(credentials);
  const response = await callProvider('https://www.googleapis.com/youtube/v3/comments', {
    method: 'POST',
    headers: bearer(token),
    query: { part: 'snippet' },
    json: { snippet: { parentId: externalCommentId, textOriginal: text } },
    label: 'YouTube',
  });
  if (!response.ok) throw failure(response, 'YouTube');
  return { externalReplyId: response.data?.id };
}

const LISTERS = {
  bluesky: listBlueskyComments,
  mastodon: listMastodonComments,
  facebook: listFacebookComments,
  instagram: listInstagramComments,
  youtube: listYouTubeComments,
};
const REPLIERS = {
  bluesky: postBlueskyReply,
  mastodon: postMastodonReply,
  facebook: postFacebookReply,
  instagram: postInstagramReply,
  youtube: postYouTubeReply,
};

export const COMMENTS_SUPPORTED_PLATFORMS = Object.keys(LISTERS);

/** Resolves to an array of real comments on this post, or throws a ProviderError. Only call for a supported platform. */
export function listComments(platform, { credentials, externalId }) {
  return LISTERS[platform]({ credentials, externalId });
}

/** Resolves to `{externalReplyId}` or throws a ProviderError. Only call for a supported platform. */
export function postReply(platform, { credentials, externalCommentId, text, meta, rootExternalId }) {
  return REPLIERS[platform]({ credentials, externalCommentId, text, meta, rootExternalId });
}
