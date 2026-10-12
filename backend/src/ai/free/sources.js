import dns from 'node:dns/promises';
import net from 'node:net';

/**
 * Free, key-less sources the free agent learns from:
 *   readWebsite(url)  — a business website's title, description and headings
 *   newsHeadlines(q)  — recent news for a topic, from Google News' public RSS feed
 * Every request has a timeout and a size cap, and only public internet addresses are allowed.
 */

const TIMEOUT_MS = 12_000;
const MAX_BYTES = 1_500_000;
const USER_AGENT = 'Mozilla/5.0 (compatible; SocialAgent/1.0)';

// ---------------------------------------------------------------- safety: public addresses only
function isPrivateAddress(address) {
  if (net.isIPv4(address)) {
    const [a, b] = address.split('.').map(Number);
    return a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127) || a >= 224;
  }
  const lower = address.toLowerCase();
  return lower === '::1' || lower === '::' || lower.startsWith('fc') || lower.startsWith('fd') || lower.startsWith('fe80') || lower.startsWith('::ffff:');
}

/**
 * Refuses anything that is not a normal public http(s) address, so a customer can never make our
 * server fetch something on its own private network (cloud metadata, the database...).
 */
export async function assertPublicUrl(rawUrl) {
  let url;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new Error('That is not a valid web address.');
  }
  if (!['http:', 'https:'].includes(url.protocol)) throw new Error('Only http(s) web addresses can be read.');
  const addresses = await dns.lookup(url.hostname, { all: true }).catch(() => []);
  if (!addresses.length) throw new Error(`Could not find ${url.hostname}.`);
  if (addresses.some(({ address }) => isPrivateAddress(address))) throw new Error('That address is not on the public internet.');
  return url;
}

/** Downloads text (HTML / RSS) with a timeout and a size cap. Redirects are followed one hop at a time, each checked. */
async function fetchText(rawUrl, redirectsLeft = 3) {
  const url = await assertPublicUrl(rawUrl);
  const response = await fetch(url, { headers: { 'User-Agent': USER_AGENT, Accept: 'text/html,application/xml;q=0.9,*/*;q=0.8' }, redirect: 'manual', signal: AbortSignal.timeout(TIMEOUT_MS) });
  if (response.status >= 300 && response.status < 400 && response.headers.get('location') && redirectsLeft > 0) {
    return fetchText(new URL(response.headers.get('location'), url).toString(), redirectsLeft - 1);
  }
  if (!response.ok) throw new Error(`${url.hostname} answered ${response.status}.`);
  const reader = response.body.getReader();
  const chunks = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.length;
    if (size > MAX_BYTES) {
      await reader.cancel();
      break; // the start of a page is plenty
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks).toString('utf8');
}

// ---------------------------------------------------------------- tiny HTML helpers (no parser library needed)
const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', '#39': "'", apos: "'", nbsp: ' ' };
export const decodeEntities = (text) =>
  String(text)
    .replace(/&(amp|lt|gt|quot|#39|apos|nbsp);/g, (_, name) => ENTITIES[name])
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)));

const clean = (text) => decodeEntities(String(text).replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();

function metaContent(html, name) {
  const pattern = new RegExp(`<meta[^>]+(?:name|property)=["']${name}["'][^>]*>`, 'i');
  const tag = html.match(pattern)?.[0];
  return tag ? clean(tag.match(/content=["']([^"']*)["']/i)?.[1] ?? '') : '';
}

/** What a business website says about itself: { title, description, headings[], keywords[] }. */
export async function readWebsite(rawUrl) {
  const html = await fetchText(rawUrl);
  const title = clean(html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? '') || metaContent(html, 'og:title');
  const description = metaContent(html, 'description') || metaContent(html, 'og:description');
  const headings = [...html.matchAll(/<h[1-3][^>]*>([\s\S]*?)<\/h[1-3]>/gi)]
    .map((match) => clean(match[1]))
    .filter((text) => text.length >= 3 && text.length <= 120);
  const keywords = metaContent(html, 'keywords')
    .split(',')
    .map((word) => word.trim())
    .filter(Boolean);
  // og:site_name is the clean brand name; a <title> is often 'Brand | long slogan'.
  const siteName = metaContent(html, 'og:site_name');
  return { title, siteName, description, headings: [...new Set(headings)].slice(0, 15), keywords: keywords.slice(0, 15) };
}

/** Recent news headlines for a topic (Google News RSS, India / English). [{ title, url, source, publishedAt }] */
export async function newsHeadlines(topic, limit = 8) {
  const feed = `https://news.google.com/rss/search?${new URLSearchParams({ q: topic, hl: 'en-IN', gl: 'IN', ceid: 'IN:en' })}`;
  const xml = await fetchText(feed);
  return [...xml.matchAll(/<item>([\s\S]*?)<\/item>/g)].slice(0, limit).map(([, item]) => ({
    title: clean(item.match(/<title>([\s\S]*?)<\/title>/)?.[1]?.replace(/<!\[CDATA\[|\]\]>/g, '') ?? ''),
    url: clean(item.match(/<link>([\s\S]*?)<\/link>/)?.[1] ?? ''),
    source: clean(item.match(/<source[^>]*>([\s\S]*?)<\/source>/)?.[1] ?? ''),
    publishedAt: clean(item.match(/<pubDate>([\s\S]*?)<\/pubDate>/)?.[1] ?? ''),
  }));
}

/**
 * The free agent calls the sources through this object, so tests can swap in fakes and never
 * depend on the internet. (Production never changes it.)
 */
export const freeSources = { readWebsite, newsHeadlines };
