/**
 * How long a post may be on each platform, and which platforms cannot take a text-only post.
 * Checked before anything is sent, so the client gets a clear message instead of a platform's error.
 * A platform with no entry either has no fixed limit or one that differs per server (Mastodon),
 * and then the platform itself is the judge.
 */
const segmenter = new Intl.Segmenter(undefined, { granularity: 'grapheme' });
const graphemes = (text) => [...segmenter.segment(text)].length;

// X counts every link as 23 characters and most Chinese/Japanese/Korean characters as 2.
function xWeight(text) {
  let weight = 0;
  for (const char of text.replace(/https?:\/\/\S+/g, 'x'.repeat(23))) {
    const code = char.codePointAt(0);
    const light = code <= 4351 || (code >= 8192 && code <= 8205) || (code >= 8208 && code <= 8223) || (code >= 8242 && code <= 8247);
    weight += light ? 1 : 2;
  }
  return weight;
}

export const TEXT_LIMITS = {
  bluesky: { limit: 300, measure: graphemes },
  x: { limit: 280, measure: xWeight },
  threads: { limit: 500, measure: graphemes },
  linkedin: { limit: 3000, measure: graphemes },
  linkedinCompany: { limit: 3000, measure: graphemes },
  facebook: { limit: 63206, measure: graphemes },
  instagram: { limit: 2200, measure: graphemes },
};
// TikTok's caption and YouTube's title/description have their own limits, but the publisher builds those
// from the post text itself (truncating the title, say) rather than rejecting the post up front for them.

/** Google Business (its own local-post API, restricted by Google to allowlisted partners) isn't built yet. */
export const NOT_IMPLEMENTED = new Set(['googleBusiness']);

/** Instagram and Pinterest are picture/video only — they need at least one attached image. Pinterest also needs a board (checked separately in postService.js, since it isn't a text/media problem). */
export const REQUIRES_IMAGE = new Set(['instagram', 'pinterest']);

/** TikTok and YouTube are video-only — they need at least one attached video. */
export const REQUIRES_VIDEO = new Set(['tiktok', 'youtube']);

/** Returns a sentence per platform that cannot take this post, or an empty list. `hasImage`/`hasVideo` say what is attached. */
export function textProblems(platforms, text, labelOf, { hasImage = false, hasVideo = false } = {}) {
  const problems = [];
  for (const platform of platforms) {
    if (NOT_IMPLEMENTED.has(platform)) {
      problems.push(`Posting to ${labelOf(platform)} isn’t available yet. Remove it from this post.`);
      continue;
    }
    if (REQUIRES_IMAGE.has(platform) && !hasImage) {
      problems.push(`${labelOf(platform)} needs at least one image attached. Add one, or remove ${labelOf(platform)} from this post.`);
      continue;
    }
    if (REQUIRES_VIDEO.has(platform) && !hasVideo) {
      problems.push(`${labelOf(platform)} needs a video attached. Add one, or remove ${labelOf(platform)} from this post.`);
      continue;
    }
    const rule = TEXT_LIMITS[platform];
    if (!rule) continue;
    const used = rule.measure(text);
    if (used > rule.limit) problems.push(`${labelOf(platform)} allows up to ${rule.limit} characters, and this post has ${used}.`);
  }
  return problems;
}
