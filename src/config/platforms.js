/**
 * Central registry of every social platform the product supports.
 * Phase 1/2 UI reads from this list instead of hard-coding platform names.
 * Phase 3 will map each `key` to a real provider module under
 * backend/src/providers/<key>/.
 */
export const PLATFORM_KEYS = {
  FACEBOOK: 'facebook',
  INSTAGRAM: 'instagram',
  X: 'x',
  LINKEDIN: 'linkedin',
  LINKEDIN_COMPANY: 'linkedinCompany',
  GOOGLE_BUSINESS: 'googleBusiness',
  YOUTUBE: 'youtube',
  PINTEREST: 'pinterest',
  TIKTOK: 'tiktok',
  MASTODON: 'mastodon',
  THREADS: 'threads',
  BLUESKY: 'bluesky',
};

export const PLATFORMS = [
  { key: PLATFORM_KEYS.FACEBOOK, label: 'Facebook Pages', icon: 'facebook', color: '#1877F2' },
  { key: PLATFORM_KEYS.INSTAGRAM, label: 'Instagram Business', icon: 'instagram', color: '#E1306C' },
  { key: PLATFORM_KEYS.X, label: 'X', icon: 'twitter', color: '#0F1419' },
  { key: PLATFORM_KEYS.LINKEDIN, label: 'LinkedIn Profiles', icon: 'linkedin', color: '#0A66C2' },
  { key: PLATFORM_KEYS.LINKEDIN_COMPANY, label: 'LinkedIn Company Pages', icon: 'linkedin', color: '#0A66C2' },
  { key: PLATFORM_KEYS.GOOGLE_BUSINESS, label: 'Google Business Profile', icon: 'store', color: '#4285F4' },
  { key: PLATFORM_KEYS.YOUTUBE, label: 'YouTube Channels', icon: 'youtube', color: '#FF0000' },
  { key: PLATFORM_KEYS.PINTEREST, label: 'Pinterest Profiles', icon: 'image', color: '#E60023' },
  { key: PLATFORM_KEYS.TIKTOK, label: 'TikTok Profiles', icon: 'music-2', color: '#000000' },
  { key: PLATFORM_KEYS.MASTODON, label: 'Mastodon Profiles', icon: 'at-sign', color: '#6364FF' },
  { key: PLATFORM_KEYS.THREADS, label: 'Threads Profiles', icon: 'at-sign', color: '#000000' },
  { key: PLATFORM_KEYS.BLUESKY, label: 'Bluesky Profiles', icon: 'cloud', color: '#0085FF' },
];

export function getPlatformByKey(key) {
  return PLATFORMS.find((platform) => platform.key === key);
}
