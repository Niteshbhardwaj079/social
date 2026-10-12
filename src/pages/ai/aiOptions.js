import { LANGUAGES } from '../../i18n/languages';

/** Choices shared by the AI Studio forms. The label of each tone is ai.tones.<tone>. */
export const TONES = ['friendly', 'professional', 'fun', 'inspiring', 'urgent', 'informative', 'luxury', 'witty'];

/**
 * The AI can write in every language the app speaks (Hinglish included). Each is shown in its own
 * script with the English name beside it ("हिन्दी · Hindi"), so it reads right whatever the app language.
 */
export const AI_LANGUAGES = LANGUAGES.map((language) => ({
  code: language.code,
  name: language.nativeName === language.name ? language.name : `${language.nativeName} · ${language.name}`,
}));

/** Picture / video shapes. The label of each is ai.aspects.<value>. */
export const ASPECTS = ['portrait', 'square', 'landscape'];

/**
 * The "Design" picture templates: a branded graphic (logo, headline, call-to-action) instead of a plain
 * photo — free and paid alike. Label: ai.image.templates.<value>; hint: ai.image.templateHints.<value>.
 * "auto" lets the agent pick one; "none" makes a plain photo with no overlay, the old behaviour.
 */
export const DESIGN_TEMPLATES = ['auto', 'bold', 'photo', 'quote', 'promo', 'none'];
