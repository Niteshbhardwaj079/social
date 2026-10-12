/**
 * The free agent's writer: ready-made post patterns filled in with the Brand Kit.
 * Each "pillar" is one kind of post. {placeholders} are replaced by fillTemplate().
 *
 * Placeholders: {company} {product} {usp} {audience} {location} {event} {topic} {cta}
 * Languages: en, hi, hinglish. Any other language falls back to English.
 * To add a pattern: add a string to the right pillar + language. Keep them short and friendly.
 */
export const TEMPLATES = {
  product: {
    en: [
      'Meet {product} from {company}. {usp}. Made for {audience}. {cta}',
      'Looking for {product}? {company} has you covered — {usp}. {cta}',
      'Why do our customers love {product}? Simple: {usp}. Try it today! {cta}',
    ],
    hi: ['{company} का {product} — {usp}। {audience} के लिए खास। {cta}', '{product} चाहिए? {company} पर भरोसा कीजिए — {usp}। {cta}'],
    hinglish: ['{company} ka {product} — {usp}. {audience} ke liye perfect! {cta}', '{product} dhoondh rahe ho? {company} hai na — {usp}. {cta}'],
  },
  tip: {
    en: [
      'Quick tip from {company}: when it comes to {topic}, small daily habits make the biggest difference. Save this post for later!',
      'Did you know? Most people get {topic} wrong in one simple way — they rush it. Take your time, ask questions, and choose quality. — Team {company}',
      '3 things to check before you choose {topic}: quality, trust, and after-sales support. We at {company} never compromise on any of them.',
    ],
    hi: ['{company} की ओर से एक टिप: {topic} में रोज़ की छोटी आदतें सबसे बड़ा फर्क लाती हैं। इस पोस्ट को सेव कर लें!', 'क्या आप जानते हैं? {topic} चुनते समय जल्दबाज़ी सबसे बड़ी गलती है। सोच-समझकर चुनें — टीम {company}'],
    hinglish: ['{company} ki taraf se quick tip: {topic} mein chhoti daily habits sabse bada fark laati hain. Post save kar lo!', 'Kya aapko pata hai? {topic} choose karte waqt jaldbaazi sabse badi galti hai. Soch samajh ke choose karein — Team {company}'],
  },
  offer: {
    en: ['Special for {audience} in {location}: ask us about this week’s offer on {product}! {cta}', 'This is your sign to finally try {product}. Message {company} today for the best deal. {cta}'],
    hi: ['{location} के {audience} के लिए खास: इस हफ्ते {product} पर ऑफ़र के बारे में पूछें! {cta}', 'आज ही {company} से {product} की सबसे अच्छी डील पाएं। {cta}'],
    hinglish: ['{location} ke {audience} ke liye special: is hafte {product} par offer ke baare mein poochho! {cta}', 'Aaj hi {company} se {product} ki best deal lo. {cta}'],
  },
  festival: {
    en: ['Happy {event}! 🎉 Wishing you and your family joy and prosperity. — With love, {company}', 'This {event}, celebrate with the people who matter most. Warm wishes from all of us at {company}! ✨'],
    hi: ['{event} की हार्दिक शुभकामनाएँ! 🎉 आपके और आपके परिवार के लिए खुशियाँ और समृद्धि — {company}', 'इस {event} पर अपनों के साथ खुशियाँ मनाएं। {company} की पूरी टीम की ओर से शुभकामनाएँ! ✨'],
    hinglish: ['Happy {event}! 🎉 Aapko aur aapki family ko dher saari khushiyan — {company}', 'Is {event} apno ke saath celebrate karo. Team {company} ki taraf se warm wishes! ✨'],
  },
  question: {
    en: ['Quick question for you: what matters most to you when choosing {topic}? Tell us in the comments 👇', 'Be honest — how do you usually pick {product}? A) Price B) Quality C) Reviews. Comment below!'],
    hi: ['आपसे एक सवाल: {topic} चुनते समय आपके लिए सबसे ज़रूरी क्या है? कमेंट में बताइए 👇'],
    hinglish: ['Ek sawaal: {topic} choose karte waqt aapke liye sabse important kya hai? Comment mein batao 👇'],
  },
  trust: {
    en: ['At {company}, {usp}. That’s a promise we keep for every customer in {location}. {cta}', 'Behind every {product} is a team that genuinely cares. Thank you for trusting {company}! 🙏'],
    hi: ['{company} में {usp} — यह वादा हम {location} के हर ग्राहक से निभाते हैं। {cta}'],
    hinglish: ['{company} mein {usp} — yeh promise hum {location} ke har customer ke saath nibhaate hain. {cta}'],
  },
  news: {
    en: ['Trending now: “{topic}”. Here’s what it means for {audience} — and how {company} can help. {cta}'],
    hi: ['अभी चर्चा में: “{topic}”। {audience} के लिए इसका क्या मतलब है — और {company} कैसे मदद कर सकता है। {cta}'],
    hinglish: ['Abhi trending: “{topic}”. {audience} ke liye iska kya matlab hai — aur {company} kaise help kar sakta hai. {cta}'],
  },
};

/** The order the free agent cycles through, so a week of posts never feels repetitive. */
export const PILLAR_ROTATION = ['product', 'tip', 'question', 'trust', 'offer', 'tip', 'product'];

/** Short, catchy line for a graphic card / slideshow slide, per pillar. */
export const CARD_HEADLINES = {
  product: { en: 'Meet {product}', hi: '{product}', hinglish: 'Try {product}' },
  tip: { en: 'Quick tip', hi: 'आज की टिप', hinglish: 'Aaj ki tip' },
  offer: { en: 'Special offer', hi: 'खास ऑफ़र', hinglish: 'Special offer' },
  festival: { en: 'Happy {event}', hi: '{event} की शुभकामनाएँ', hinglish: 'Happy {event}' },
  question: { en: 'Tell us 👇', hi: 'हमें बताइए', hinglish: 'Batao 👇' },
  trust: { en: 'Our promise', hi: 'हमारा वादा', hinglish: 'Hamara promise' },
  news: { en: 'Trending now', hi: 'अभी चर्चा में', hinglish: 'Abhi trending' },
};

const pickLanguage = (table, language) => table[language] ?? table.en;

/** Replaces {placeholders}; a value that is missing leaves a sensible generic word instead of "{x}". */
export function fillTemplate(template, values) {
  return template
    .replace(/\{(\w+)\}/g, (_, key) => values[key] ?? '')
    .replace(/\s+([.,!?।])/g, '$1')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

/** Hashtags from the business keywords, industry, location and the post's topic (3-6, no duplicates). */
export function hashtagsFor({ keywords = [], industry = '', location = '', extra = [] }) {
  const words = [...extra, ...keywords, industry, location]
    .map((word) => String(word).replace(/[^\p{L}\p{N}]+/gu, ''))
    .filter((word) => word.length >= 3 && word.length <= 30);
  return [...new Set(words.map((word) => `#${word}`))].slice(0, 6);
}

/** One post for a pillar. `seed` picks which of the pillar's patterns to use (so it varies day to day). */
export function writeFreePost(pillar, language, values, seed = 0) {
  const options = pickLanguage(TEMPLATES[pillar] ?? TEMPLATES.tip, language);
  return fillTemplate(options[seed % options.length], values);
}

export function cardHeadline(pillar, language, values) {
  return fillTemplate(pickLanguage(CARD_HEADLINES[pillar] ?? CARD_HEADLINES.tip, language), values);
}
