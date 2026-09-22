import { PLATFORM_KEYS } from './platforms';

/**
 * What each platform's API will tell us about the person on the other side of a
 * conversation, and what it costs.
 *
 *   free — returned by the platform's free API access. Always shown.
 *   paid — only returned when the client's own API key is on a PAID plan of that
 *          platform (bring-your-own-key, so Social never pays for it). Shown only
 *          when the connected account is marked `apiTier: 'paid'`; otherwise the
 *          Inbox shows a small "unlocks with a paid plan" hint instead.
 *
 * Adding a paid tier for another platform later = add a `paid` list + `paidPlanName`.
 * Keep this in step with what the real provider modules (Phase 3) can fetch.
 */
export const PROFILE_FIELD_META = {
  handle: { label: 'Username', icon: 'AtSign' },
  userId: { label: 'Platform ID', icon: 'Fingerprint' },
  followers: { label: 'Followers', icon: 'Users', isStat: true },
  following: { label: 'Following', icon: 'UserPlus', isStat: true },
  posts: { label: 'Posts', icon: 'FileText', isStat: true },
  verified: { label: 'Verified', icon: 'BadgeCheck' },
  followsYou: { label: 'Follows you', icon: 'UserCheck' },
  youFollow: { label: 'You follow them', icon: 'UserPlus' },
  joinedAt: { label: 'On platform since', icon: 'CalendarDays' },
  location: { label: 'Location', icon: 'MapPin' },
  bio: { label: 'Bio', icon: 'FileText', isLong: true },
  profileUrl: { label: 'Profile', icon: 'ExternalLink' },
};

const PLATFORM_PROFILE_ACCESS = {
  [PLATFORM_KEYS.FACEBOOK]: {
    free: ['userId'],
    paid: [],
    note: 'Facebook only shares a private ID and the name with Pages — no follower counts.',
  },
  [PLATFORM_KEYS.INSTAGRAM]: {
    free: ['handle', 'userId', 'followers', 'verified', 'followsYou', 'youFollow'],
    paid: [],
  },
  [PLATFORM_KEYS.X]: {
    free: ['handle', 'userId'],
    paid: ['followers', 'following', 'posts', 'verified', 'joinedAt', 'location', 'bio', 'profileUrl'],
    paidPlanName: 'a paid X API plan (Basic or higher)',
    note: 'X’s free API tier cannot look up other people’s profiles.',
  },
  [PLATFORM_KEYS.LINKEDIN]: {
    free: ['userId'],
    paid: [],
    note: 'LinkedIn does not share profile details of people who message you.',
  },
  [PLATFORM_KEYS.LINKEDIN_COMPANY]: { free: ['userId'], paid: [] },
  [PLATFORM_KEYS.GOOGLE_BUSINESS]: { free: ['userId'], paid: [] },
  [PLATFORM_KEYS.YOUTUBE]: {
    free: ['handle', 'userId', 'followers', 'posts', 'joinedAt', 'bio', 'profileUrl'],
    paid: [],
  },
  [PLATFORM_KEYS.PINTEREST]: {
    free: ['handle', 'userId', 'followers', 'following', 'posts', 'bio', 'profileUrl'],
    paid: [],
  },
  [PLATFORM_KEYS.TIKTOK]: {
    free: ['handle', 'userId', 'followers', 'following', 'verified', 'bio', 'profileUrl'],
    paid: [],
  },
  [PLATFORM_KEYS.MASTODON]: {
    free: ['handle', 'userId', 'followers', 'following', 'posts', 'joinedAt', 'bio', 'profileUrl'],
    paid: [],
  },
  [PLATFORM_KEYS.THREADS]: {
    free: ['handle', 'userId', 'verified', 'bio', 'profileUrl'],
    paid: [],
  },
  [PLATFORM_KEYS.BLUESKY]: {
    free: ['handle', 'userId', 'followers', 'following', 'posts', 'joinedAt', 'bio', 'profileUrl'],
    paid: [],
  },
};

export function getProfileAccess(platformKey) {
  return PLATFORM_PROFILE_ACCESS[platformKey] || { free: [], paid: [] };
}

// True when the platform has extra data behind a paid plan — the Connect page then asks which plan the key is on.
export function platformHasPaidTier(platformKey) {
  return getProfileAccess(platformKey).paid.length > 0;
}

/**
 * Splits a customer's profile into what may be shown now and what is locked.
 *   shown:  [{ key, value, isPaid }]   (value present and allowed for this tier)
 *   locked: ['followers', ...]         (paid-only fields, tier is free)
 */
export function resolveProfileFields(platformKey, apiTier, profile = {}) {
  const access = getProfileAccess(platformKey);
  const isPaidTier = apiTier === 'paid';
  const has = (key) => profile[key] !== undefined && profile[key] !== null && profile[key] !== '';

  const shown = [];
  access.free.filter(has).forEach((key) => shown.push({ key, value: profile[key], isPaid: false }));
  if (isPaidTier) access.paid.filter(has).forEach((key) => shown.push({ key, value: profile[key], isPaid: true }));

  return { shown, locked: isPaidTier ? [] : access.paid.filter(has), access };
}
