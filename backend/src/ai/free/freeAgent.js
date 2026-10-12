import { upcomingEvents } from './events.js';
import { freeSources } from './sources.js';
import { PILLAR_ROTATION, cardHeadline, hashtagsFor, writeFreePost } from './templates.js';
import { logger } from '../../utils/logger.js';

/**
 * The FREE agent: does the marketing agent's jobs without any paid AI.
 *   brandKitFromWebsite(url)   → suggested Brand Kit fields from the website itself
 *   research(kit)              → news on the industry & competitors + upcoming festivals → post ideas
 *   writePost(kit, idea, ...)  → post text from templates, in English / Hindi / Hinglish
 *   cardText(kit, idea, ...)   → headline + line for a graphic card
 * Same inputs and outputs as the paid-AI path in aiAgentService.js, so the rest of the app does not care.
 */

const lines = (text) =>
  String(text ?? '')
    .split(/\r?\n|,/)
    .map((line) => line.trim())
    .filter(Boolean);

/** The Brand Kit as the values templates need, with friendly fallbacks for anything left empty. */
export function templateValues(kit, { topic, event, productIndex = 0 } = {}) {
  const products = lines(kit.products);
  const usps = lines(kit.usps);
  const product = products.length ? products[productIndex % products.length] : kit.industry || 'our services';
  return {
    company: kit.company_name || 'our team',
    product,
    usp: usps.length ? usps[productIndex % usps.length].replace(/\.$/, '') : 'quality you can trust',
    audience: kit.target_audience || 'you',
    location: kit.location || 'your city',
    topic: topic || product,
    event: event || '',
    cta: kit.phone ? `📞 ${kit.phone}` : kit.website ? `🔗 ${kit.website}` : 'DM us to know more!',
  };
}

// ---------------------------------------------------------------- Brand Kit from a website
export async function brandKitFromWebsite(url) {
  const site = await freeSources.readWebsite(url);
  const name = site.siteName || site.title.split(/[|\-–—:]/)[0].trim();
  return {
    companyName: name,
    website: url,
    description: site.description,
    products: site.headings.slice(0, 6).join('\n'),
    keywords: site.keywords.slice(0, 8).join(', '),
  };
}

// ---------------------------------------------------------------- research
/** One topic's news, never failing the whole report (a feed can be down). */
async function safeHeadlines(topic, limit) {
  try {
    return await freeSources.newsHeadlines(topic, limit);
  } catch (error) {
    logger.warn('Free agent: news feed failed', { topic, error: error.message });
    return [];
  }
}

/**
 * A research report from free sources: industry news, competitor mentions and upcoming events,
 * turned into post ideas. Returns { summary, insights, ideas, sources }.
 */
export async function research(kit) {
  const industryTopic = [kit.industry, kit.location].filter(Boolean).join(' ') || kit.company_name || 'small business marketing';
  const competitors = lines(kit.competitors).slice(0, 3);

  const [industryNews, ...competitorNews] = await Promise.all([safeHeadlines(industryTopic, 8), ...competitors.map((name) => safeHeadlines(name, 3))]);
  const events = upcomingEvents(new Date(), 30);

  const ideas = [
    ...events.slice(0, 4).map((event) => ({ title: `${event.name} (${event.date})`, angle: `Greet followers for ${event.name} and connect it to ${kit.company_name || 'your business'}.`, format: 'image', pillar: 'festival', event: event.name, date: event.date })),
    ...industryNews.slice(0, 4).map((item) => ({ title: item.title, angle: 'React to this news and explain what it means for your customers.', format: 'text', pillar: 'news', topic: item.title })),
    ...lines(kit.products).slice(0, 4).map((product) => ({ title: `Spotlight: ${product}`, angle: `Show why customers choose ${product}.`, format: 'image', pillar: 'product', topic: product })),
    { title: 'Ask your audience', angle: 'A question post to get comments and reach.', format: 'text', pillar: 'question' },
    { title: 'Why trust us', angle: 'Share your promise / unique strengths.', format: 'image', pillar: 'trust' },
    { title: 'A helpful tip', angle: 'Teach something useful about your field.', format: 'text', pillar: 'tip' },
  ];

  const competitorInsights = competitors.map((name, index) => ({
    name,
    whatTheyDo: competitorNews[index]?.length ? `In the news: ${competitorNews[index][0].title}` : 'No recent news found.',
    opportunity: 'Post more often than them, and highlight what makes you different.',
  }));

  const summary = [
    `Free research for ${kit.company_name || 'your business'}${kit.location ? ` in ${kit.location}` : ''}.`,
    events.length ? `Coming up: ${events.slice(0, 3).map((event) => `${event.name} (${event.date})`).join(', ')}.` : 'No major festivals in the next 30 days.',
    industryNews.length ? `${industryNews.length} recent news items about "${industryTopic}".` : `No recent news found for "${industryTopic}".`,
  ].join(' ');

  return {
    summary,
    insights: { competitors: competitorInsights, trends: industryNews.map((item) => item.title), events },
    ideas,
    sources: [...industryNews, ...competitorNews.flat()].map((item) => ({ title: item.title, url: item.url })).slice(0, 20),
  };
}

// ---------------------------------------------------------------- writing
/** Post text for an idea (or the day's pillar when there is no idea). `seed` varies the wording. */
export function writePost(kit, idea, { language = 'en', seed = 0, hashtags = true } = {}) {
  const pillar = idea?.pillar ?? PILLAR_ROTATION[seed % PILLAR_ROTATION.length];
  const values = templateValues(kit, { topic: idea?.topic, event: idea?.event, productIndex: seed });
  const text = writeFreePost(pillar, language, values, seed);
  if (!hashtags) return text;
  const tags = hashtagsFor({ keywords: lines(kit.keywords), industry: kit.industry, location: kit.location, extra: idea?.event ? [idea.event] : [] });
  return tags.length ? `${text}\n\n${tags.join(' ')}` : text;
}

/** The call-to-action a graphic card's button shows — a phone number first, else the website, else nothing. */
export function cardCta(kit) {
  if (kit.phone) return `Call ${kit.phone}`;
  if (kit.website) return 'Visit Us';
  return '';
}

/** Headline + one line for the graphic card that goes with a post. */
export function cardText(kit, idea, { language = 'en', seed = 0 } = {}) {
  const pillar = idea?.pillar ?? PILLAR_ROTATION[seed % PILLAR_ROTATION.length];
  const values = templateValues(kit, { topic: idea?.topic, event: idea?.event, productIndex: seed });
  const usps = lines(kit.usps);
  return {
    headline: cardHeadline(pillar, language, values),
    body: pillar === 'festival' ? `Warm wishes from ${values.company}` : usps[seed % Math.max(usps.length, 1)] || values.product,
    cta: cardCta(kit),
    footer: [kit.company_name, kit.location].filter(Boolean).join(' · '),
  };
}

// ---------------------------------------------------------------- the AI Studio's "write from a brief", without AI
const shorten = (text, max) => {
  const clean = String(text ?? '').replace(/\s+/g, ' ').trim();
  return clean.length <= max ? clean : `${clean.slice(0, max - 1).replace(/\s+\S*$/, '')}…`;
};

/**
 * A few versions of a post from a person's brief (or a research idea), with no AI involved:
 * the brief stays in the person's own words, the Brand Kit adds the strengths, call-to-action and hashtags.
 */
export function writeVariants(kit, { brief = '', idea = null, language = 'en', variants = 3, hashtags = true }) {
  if (idea || !brief.trim()) {
    return Array.from({ length: variants }, (_, seed) => writePost(kit, idea, { language, seed, hashtags }));
  }
  const values = templateValues(kit);
  const tags = hashtags ? hashtagsFor({ keywords: lines(kit.keywords), industry: kit.industry, location: kit.location }).join(' ') : '';
  const text = brief.trim().replace(/\.?$/, '.');
  const patterns = [
    `${text}\n\n${values.cta}`,
    `✨ ${text}\n${kit.company_name ? `— ${kit.company_name}: ` : ''}${values.usp}. ${values.cta}`,
    `${text} ${kit.location ? `📍 ${kit.location}. ` : ''}${values.cta}`,
    `Big news from ${values.company}! ${text} ${values.cta}`,
    `${text}\n\nWhy ${values.company}? ${values.usp}. ${values.cta}`,
  ];
  return patterns.slice(0, variants).map((post) => (tags ? `${post}\n\n${tags}` : post));
}

/** Text for a graphic card made from a prompt (when there is no research idea). */
export function cardFromPrompt(kit, { prompt, textOnImage = '' }) {
  const usps = lines(kit.usps);
  return {
    headline: shorten(textOnImage || prompt, 48),
    body: textOnImage ? shorten(prompt, 110) : usps[0] || kit.description?.slice(0, 110) || '',
    cta: cardCta(kit),
    footer: [kit.company_name, kit.location].filter(Boolean).join(' · '),
  };
}

/** A slideshow plan without AI: opening line, the business's strengths / products, then a call-to-action. */
export function slidePlan(kit, { brief, slideCount = 4, language = 'en' }) {
  const middle = [...lines(kit.usps), ...lines(kit.products)];
  const slides = [shorten(brief || kit.description || kit.company_name, 60)];
  for (let index = 0; slides.length < slideCount - 1 && index < middle.length; index += 1) slides.push(shorten(middle[index], 60));
  while (slides.length < slideCount - 1) slides.push(shorten(templateValues(kit).usp, 60));
  slides.push(kit.phone ? `Call ${kit.phone}` : kit.website ? `Visit ${kit.website}` : `Follow ${kit.company_name || 'us'} for more`);
  return {
    captions: slides.slice(0, slideCount),
    postText: writeVariants(kit, { brief, language, variants: 1 })[0],
  };
}
