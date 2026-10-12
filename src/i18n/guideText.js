import { useEffect, useState } from 'react';
import { useI18n } from './useI18n';

/**
 * Translations for the long help texts: the Help Guide chapters
 * (config/guideChapters.js) and the "how to connect" guides
 * (config/platformConnectGuides.js).
 *
 * Those config files hold the structure and the English text. Each
 * `guides/<code>.js` file holds only the translated text, keyed the same way:
 *   { chapters: { <chapterId>: { title, description, readTime, content: [] } },
 *     connect:  { <platformKey>: { badge, guideTitle, intro, steps: [], providerLabel,
 *                                  fields: { <fieldKey>: { label, placeholder, hint } } } } }
 * Anything missing simply shows in English, so a half-done file never breaks a page.
 */
const guideLoaders = import.meta.glob('./guides/*.js');
const cache = new Map();

function loadGuideText(code) {
  if (code === 'en') return Promise.resolve(null);
  if (cache.has(code)) return Promise.resolve(cache.get(code));
  const loader = guideLoaders[`./guides/${code}.js`];
  if (!loader) return Promise.resolve(null);
  return loader()
    .then((module) => {
      cache.set(code, module.default);
      return module.default;
    })
    .catch((error) => {
      // Offline or a new deploy: show English now, try again next time (failures are not cached).
      console.warn(`[i18n] could not load guide text for '${code}'`, error);
      return null;
    });
}

/** The guide text for the current language, or null while loading / for English. */
export function useGuideText() {
  const { language } = useI18n();
  const [loaded, setLoaded] = useState({ code: 'en', text: null });

  useEffect(() => {
    let cancelled = false;
    loadGuideText(language).then((text) => {
      if (!cancelled) setLoaded({ code: language, text });
    });
    return () => {
      cancelled = true;
    };
  }, [language]);

  // Never show the previous language's text while the new one loads.
  return loaded.code === language ? loaded.text : null;
}

// A translated list is used only when it has the same number of items as the English one,
// so steps never go missing or get out of step with the numbering.
function sameLengthList(translated, english) {
  return Array.isArray(translated) && translated.length === english.length ? translated : english;
}

/** A Help Guide chapter with its text in the current language. */
export function localizeChapter(chapter, text) {
  const translated = text?.chapters?.[chapter.id];
  if (!translated) return chapter;
  return {
    ...chapter,
    title: translated.title || chapter.title,
    description: translated.description || chapter.description,
    readTime: translated.readTime || chapter.readTime,
    content: sameLengthList(translated.content, chapter.content),
  };
}

/** A platform's connect guide with its text in the current language. */
export function localizeConnectGuide(platformKey, guide, text) {
  const translated = text?.connect?.[platformKey];
  if (!guide || !translated) return guide;
  return {
    ...guide,
    badge: translated.badge || guide.badge,
    guideTitle: translated.guideTitle || guide.guideTitle,
    intro: translated.intro || guide.intro,
    steps: sameLengthList(translated.steps, guide.steps),
    providerLabel: translated.providerLabel || guide.providerLabel,
    fields: guide.fields.map((field) => {
      const fieldText = translated.fields?.[field.key] || {};
      return {
        ...field,
        label: fieldText.label || field.label,
        placeholder: fieldText.placeholder || field.placeholder,
        hint: fieldText.hint || field.hint,
      };
    }),
  };
}
