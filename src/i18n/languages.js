/**
 * Every language Social can be shown in (and can send system emails in).
 *
 * `code` is also the file name in ./locales/. `nativeName` is how speakers of
 * that language write it, so someone who cannot read English can still find
 * their own language in a menu. `htmlLang` goes on <html lang> so browsers pick
 * the right fonts, hyphenation and spell-check. Only Arabic is right-to-left.
 *
 * Adding a language later: add one row here and one file in ./locales/
 * (copy en.js, translate the values). Missing keys fall back to English.
 */
export const LANGUAGES = [
  { code: 'en', name: 'English', nativeName: 'English', htmlLang: 'en', dir: 'ltr' },
  { code: 'hi', name: 'Hindi', nativeName: 'हिन्दी', htmlLang: 'hi', dir: 'ltr' },
  { code: 'hinglish', name: 'Hinglish (Romanized Hindi)', nativeName: 'Hinglish', htmlLang: 'hi-Latn', dir: 'ltr' },
  { code: 'gu', name: 'Gujarati', nativeName: 'ગુજરાતી', htmlLang: 'gu', dir: 'ltr' },
  { code: 'mr', name: 'Marathi', nativeName: 'मराठी', htmlLang: 'mr', dir: 'ltr' },
  { code: 'bn', name: 'Bengali', nativeName: 'বাংলা', htmlLang: 'bn', dir: 'ltr' },
  { code: 'ta', name: 'Tamil', nativeName: 'தமிழ்', htmlLang: 'ta', dir: 'ltr' },
  { code: 'te', name: 'Telugu', nativeName: 'తెలుగు', htmlLang: 'te', dir: 'ltr' },
  { code: 'ml', name: 'Malayalam', nativeName: 'മലയാളം', htmlLang: 'ml', dir: 'ltr' },
  { code: 'kn', name: 'Kannada', nativeName: 'ಕನ್ನಡ', htmlLang: 'kn', dir: 'ltr' },
  { code: 'pa', name: 'Punjabi', nativeName: 'ਪੰਜਾਬੀ', htmlLang: 'pa', dir: 'ltr' },
  { code: 'ar', name: 'Arabic', nativeName: 'العربية', htmlLang: 'ar', dir: 'rtl' },
  { code: 'es', name: 'Spanish', nativeName: 'Español', htmlLang: 'es', dir: 'ltr' },
  { code: 'fr', name: 'French', nativeName: 'Français', htmlLang: 'fr', dir: 'ltr' },
  { code: 'de', name: 'German', nativeName: 'Deutsch', htmlLang: 'de', dir: 'ltr' },
  { code: 'pt', name: 'Portuguese', nativeName: 'Português', htmlLang: 'pt', dir: 'ltr' },
  { code: 'zh', name: 'Chinese (Simplified)', nativeName: '简体中文', htmlLang: 'zh-Hans', dir: 'ltr' },
  { code: 'ru', name: 'Russian', nativeName: 'Русский', htmlLang: 'ru', dir: 'ltr' },
  { code: 'th', name: 'Thai', nativeName: 'ไทย', htmlLang: 'th', dir: 'ltr' },
  { code: 'ja', name: 'Japanese', nativeName: '日本語', htmlLang: 'ja', dir: 'ltr' },
  { code: 'ko', name: 'Korean', nativeName: '한국어', htmlLang: 'ko', dir: 'ltr' },
];

export const DEFAULT_LANGUAGE = 'en';

const BY_CODE = new Map(LANGUAGES.map((language) => [language.code, language]));

export function getLanguage(code) {
  return BY_CODE.get(code) || BY_CODE.get(DEFAULT_LANGUAGE);
}

export function isKnownLanguage(code) {
  return BY_CODE.has(code);
}

// Short label for a tight trigger button: "EN", "HI", "AR"…
export function getLanguageShortCode(code) {
  return code === 'hinglish' ? 'HING' : code.toUpperCase();
}
