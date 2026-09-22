import en from './locales/en';

// English is bundled. Every other language is its own chunk, fetched the first
// time it is needed (chosen in the header, or opened in the System Emails editor).
const localeLoaders = import.meta.glob(['./locales/*.js', '!./locales/en.js']);
const rawCache = new Map([['en', en]]);

export function loadLocale(code) {
  if (rawCache.has(code)) return Promise.resolve(rawCache.get(code));
  const loader = localeLoaders[`./locales/${code}.js`];
  if (!loader) return Promise.resolve(en);
  return loader()
    .then((module) => {
      rawCache.set(code, module.default);
      return module.default;
    })
    .catch((error) => {
      // Offline, or a new deploy replaced the file: the app keeps working in English
      // and tries again the next time the language is chosen (a failure is never cached).
      console.warn(`[i18n] could not load language '${code}'`, error);
      return en;
    });
}

// Flattens { a: { b: 'x' } } to { 'a.b': 'x' } so t('a.b') is a plain lookup.
export function flattenMessages(source, prefix = '', out = {}) {
  Object.entries(source).forEach(([key, value]) => {
    const path = prefix ? `${prefix}.${key}` : key;
    if (value && typeof value === 'object' && !Array.isArray(value)) flattenMessages(value, path, out);
    else out[path] = value;
  });
  return out;
}
