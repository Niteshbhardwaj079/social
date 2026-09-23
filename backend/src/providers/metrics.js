import { config } from '../config/env.js';
import { callProvider, failure } from './http.js';
import { rejection } from './errors.js';
import { oauth1Header } from './oauth1.js';
import { graphGet } from './meta.js';
import { accessTokenFor as googleAccessTokenFor } from './google.js';

/**
 * Reading back how a published post is doing, for the platforms whose API can answer without extra
 * app-review beyond what posting itself already needs. `fetchMetrics(platform, {credentials, externalId})`
 * resolves to `{likes, comments, shares, views}` — any field the platform does not report stays `null`,
 * never a guessed 0 (0 means "the platform said zero", null means "this platform doesn't tell us that").
 *
 * Not every platform this app posts to is here — see providers/metrics.js's export, `SUPPORTED_PLATFORMS`,
 * and the README for which ones and why not:
 *   - Threads: its Insights API is new enough (2024) that this codebase does not have confident,
 *     verified knowledge of its exact stable metric names — deferred rather than guessed, same reasoning
 *     as Google Business Profile posting.
 *   - LinkedIn: reading a post's own social-action counts back needs the Marketing Developer Platform
 *     partner tier, not the basic posting access this app already uses — most developer apps cannot get
 *     this at all, so it would fail for nearly every real client.
 *   - TikTok: an unaudited app's video is SELF_ONLY (see publishers.js) and the publish call only returns
 *     an async `publish_id`, not a fetchable video id — there is no confirmed, safe path to real metrics here.
 *   - Pinterest, Google Business: not attempted this pass — genuinely not researched with enough confidence yet.
 */

const bearer = (token) => ({ authorization: `Bearer ${token}` });

// ---------------------------------------------------------------- Bluesky
// The public AppView, not the PDS (bsky.social) used for posting — reading a public post's counts needs
// no session/login at all.
const BLUESKY_PUBLIC = 'https://public.api.bsky.app/xrpc';

async function fetchBlueskyMetrics({ externalId }) {
  const response = await callProvider(`${BLUESKY_PUBLIC}/app.bsky.feed.getPostThread`, {
    query: { uri: externalId, depth: 0 },
    label: 'Bluesky',
  });
  if (!response.ok) throw failure(response, 'Bluesky');
  const post = response.data?.thread?.post;
  if (!post) throw rejection('Bluesky did not return this post (it may have been deleted).');
  return { likes: post.likeCount ?? null, comments: post.replyCount ?? null, shares: post.repostCount ?? null, views: null };
}

// ---------------------------------------------------------------- Mastodon
async function fetchMastodonMetrics({ credentials, externalId }) {
  const origin = credentials.instanceUrl.replace(/\/+$/, '');
  const response = await callProvider(`${origin}/api/v1/statuses/${encodeURIComponent(externalId)}`, {
    headers: bearer(credentials.accessToken),
    label: 'Mastodon',
  });
  if (!response.ok) throw failure(response, 'Mastodon');
  return {
    likes: response.data?.favourites_count ?? null,
    comments: response.data?.replies_count ?? null,
    shares: response.data?.reblogs_count ?? null,
    views: null,
  };
}

// ---------------------------------------------------------------- X
function xAuthHeader({ method, url, credentials }) {
  return oauth1Header({
    method,
    url,
    params: {},
    consumerKey: credentials.apiKey,
    consumerSecret: credentials.apiSecret,
    token: credentials.accessToken,
    tokenSecret: credentials.accessTokenSecret,
  });
}

async function fetchXMetrics({ credentials, externalId }) {
  const url = `https://api.x.com/2/tweets/${encodeURIComponent(externalId)}`;
  const authorization = xAuthHeader({ method: 'GET', url, credentials });
  const response = await callProvider(url, { headers: { authorization }, query: { 'tweet.fields': 'public_metrics' }, label: 'X' });
  if (!response.ok) throw failure(response, 'X');
  const metrics = response.data?.data?.public_metrics;
  if (!metrics) throw rejection('X did not return this post (it may have been deleted).');
  return {
    likes: metrics.like_count ?? null,
    comments: metrics.reply_count ?? null,
    shares: metrics.retweet_count ?? null,
    views: metrics.impression_count ?? null,
  };
}

// ---------------------------------------------------------------- Facebook Pages
async function fetchFacebookMetrics({ credentials, externalId }) {
  const data = await graphGet(`https://graph.facebook.com/${config.social.metaGraphVersion}`, encodeURIComponent(externalId), {
    label: 'Facebook',
    token: credentials.accessToken,
    appSecret: credentials.appSecret,
    fields: 'likes.summary(true).limit(0),comments.summary(true).limit(0),shares',
  });
  return {
    likes: data.likes?.summary?.total_count ?? null,
    comments: data.comments?.summary?.total_count ?? null,
    shares: data.shares?.count ?? 0, // Graph API omits `shares` entirely when the count is zero
    views: null,
  };
}

// ---------------------------------------------------------------- Instagram Business
async function fetchInstagramMetrics({ credentials, externalId }) {
  const data = await graphGet(`https://graph.facebook.com/${config.social.metaGraphVersion}`, encodeURIComponent(externalId), {
    label: 'Instagram',
    token: credentials.accessToken,
    appSecret: credentials.appSecret,
    fields: 'like_count,comments_count',
  });
  return { likes: data.like_count ?? null, comments: data.comments_count ?? null, shares: null, views: null };
}

// ---------------------------------------------------------------- YouTube
async function fetchYouTubeMetrics({ credentials, externalId }) {
  const token = await googleAccessTokenFor(credentials);
  const response = await callProvider('https://www.googleapis.com/youtube/v3/videos', {
    headers: bearer(token),
    query: { part: 'statistics', id: externalId },
    label: 'YouTube',
  });
  if (!response.ok) throw failure(response, 'YouTube');
  const stats = response.data?.items?.[0]?.statistics;
  if (!stats) throw rejection('YouTube did not return this video (it may have been deleted).');
  return {
    likes: stats.likeCount !== undefined ? Number(stats.likeCount) : null,
    comments: stats.commentCount !== undefined ? Number(stats.commentCount) : null,
    shares: null,
    views: stats.viewCount !== undefined ? Number(stats.viewCount) : null,
  };
}

const FETCHERS = {
  bluesky: fetchBlueskyMetrics,
  mastodon: fetchMastodonMetrics,
  x: fetchXMetrics,
  facebook: fetchFacebookMetrics,
  instagram: fetchInstagramMetrics,
  youtube: fetchYouTubeMetrics,
};

export const METRICS_SUPPORTED_PLATFORMS = Object.keys(FETCHERS);

/** Resolves to `{likes, comments, shares, views}` or throws a ProviderError. Only call for a supported platform. */
export function fetchMetrics(platform, { credentials, externalId }) {
  return FETCHERS[platform]({ credentials, externalId });
}
