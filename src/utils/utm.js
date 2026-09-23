// UTM Builder (Phase 6). Purely a client-side URL utility — no backend involved, since building a
// tagged URL is just adding query parameters to a link the person already controls.

export const UTM_SOURCES = ['facebook', 'instagram', 'google', 'linkedin', 'x', 'tiktok', 'pinterest', 'youtube', 'email', 'newsletter', 'sms', 'whatsapp'];
export const UTM_MEDIUMS = ['cpc', 'paid-social', 'social', 'email', 'referral', 'organic', 'affiliate', 'sms', 'push'];

const UTM_KEYS = { source: 'utm_source', medium: 'utm_medium', campaign: 'utm_campaign', term: 'utm_term', content: 'utm_content' };

/**
 * Appends (or overwrites) utm_* parameters on `baseUrl`. Returns the full tagged URL, or null if
 * `baseUrl` isn't a valid absolute URL — never throws, so callers can just check the result.
 * Re-tagging an already-tagged URL replaces its existing utm_* values rather than duplicating them.
 */
export function buildUtmUrl(baseUrl, { source, medium, campaign, term, content } = {}) {
  let url;
  try {
    url = new URL(String(baseUrl || '').trim());
  } catch {
    return null;
  }
  const values = { source, medium, campaign, term, content };
  for (const [field, key] of Object.entries(UTM_KEYS)) {
    const value = String(values[field] || '').trim();
    if (value) url.searchParams.set(key, value);
    else url.searchParams.delete(key);
  }
  return url.toString();
}

/** Reads back whatever utm_* values a URL already carries, for prefilling the builder on an already-tagged link. */
export function parseUtmParams(url) {
  try {
    const parsed = new URL(String(url || '').trim());
    return {
      source: parsed.searchParams.get('utm_source') || '',
      medium: parsed.searchParams.get('utm_medium') || '',
      campaign: parsed.searchParams.get('utm_campaign') || '',
      term: parsed.searchParams.get('utm_term') || '',
      content: parsed.searchParams.get('utm_content') || '',
    };
  } catch {
    return { source: '', medium: '', campaign: '', term: '', content: '' };
  }
}

/** The base URL with every utm_* parameter stripped — what buildUtmUrl needs as its starting point. */
export function stripUtmParams(url) {
  try {
    const parsed = new URL(String(url || '').trim());
    Object.values(UTM_KEYS).forEach((key) => parsed.searchParams.delete(key));
    return parsed.toString();
  } catch {
    return url || '';
  }
}
