import { useCallback, useEffect, useMemo, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import en from './locales/en';
import { flattenMessages as flatten, loadLocale } from './loadLocale';
import { I18nContext } from './useI18n';
import { LANGUAGES, getLanguage } from './languages';
import { setLanguage as setLanguageAction } from '../store/slices/i18nSlice';
import { setCurrentUserLanguage } from '../store/slices/authSlice';
import { API_ENABLED } from '../config/runtime';
import { hasAccessToken } from '../services/api/axiosClient';
import { saveMyLanguageRequest } from '../services/api/authApi';
import { setFormatLocale } from '../utils/formatters';

/**
 * Lightweight, dependency-free i18n.
 *
 *  - Messages live in ./locales/<code>.js as nested objects; `t('users.invite')`
 *    reads the flattened key.
 *  - English is bundled. Every other language is its own chunk, fetched the first
 *    time it is chosen (or needed by the System Emails editor) and then cached.
 *  - A key missing from a language falls back to English, so a partly translated
 *    language still works and can be completed later without code changes.
 *  - `{name}` placeholders are filled from the second argument of t().
 */

const englishMessages = flatten(en);

function interpolate(template, vars) {
  if (!vars || typeof template !== 'string') return template;
  return template.replace(/\{(\w+)\}/g, (match, name) => (vars[name] === undefined ? match : String(vars[name])));
}

export function I18nProvider({ children }) {
  const dispatch = useDispatch();
  const language = useSelector((state) => state.i18n.language);
  const enabledCodes = useSelector((state) => state.i18n.enabledLanguages);
  const defaultCode = useSelector((state) => state.i18n.defaultLanguage);

  // Until a chosen language finishes loading we keep showing the previous one
  // (no blank flash). `loaded` is the language whose messages are on screen.
  const [loaded, setLoaded] = useState(() => ({ code: 'en', messages: englishMessages }));
  // Only the very first paint waits (when the saved language is not English), so
  // a returning Hindi user never sees a flash of English.
  const [isReady, setIsReady] = useState(language === 'en');

  useEffect(() => {
    let cancelled = false;
    loadLocale(language).then((raw) => {
      if (cancelled) return;
      setLoaded({ code: language, messages: flatten(raw) });
      setIsReady(true);
    });
    return () => {
      cancelled = true;
    };
  }, [language]);

  const info = getLanguage(loaded.code);
  // Set during render (not in an effect) so dates drawn by children in this same pass already use it.
  setFormatLocale(info.htmlLang);

  // <html lang dir> drives fonts, text direction and every `[dir='rtl']` style.
  useEffect(() => {
    document.documentElement.setAttribute('lang', info.htmlLang);
    document.documentElement.setAttribute('dir', info.dir);
  }, [info]);

  const t = useCallback(
    (key, vars) => {
      const message = loaded.messages[key] ?? englishMessages[key];
      if (message === undefined) {
        if (import.meta.env.DEV) console.warn(`[i18n] missing key: ${key}`);
        return key;
      }
      return interpolate(message, vars);
    },
    [loaded]
  );

  const enabledLanguages = useMemo(() => LANGUAGES.filter((item) => enabledCodes.includes(item.code)), [enabledCodes]);

  // Picking a language switches the screen at once. With a server and a signed-in person it is also
  // saved on their profile, so their emails follow the same language on every device.
  const setLanguage = useCallback(
    (code) => {
      dispatch(setLanguageAction(code));
      if (API_ENABLED && hasAccessToken()) {
        saveMyLanguageRequest(code)
          .then(() => dispatch(setCurrentUserLanguage(code)))
          .catch(() => {}); // the screen already changed; a failed save just means it is not remembered server-side
      }
    },
    [dispatch]
  );

  const value = useMemo(
    () => ({
      t,
      language,
      languageInfo: info,
      dir: info.dir,
      isRtl: info.dir === 'rtl',
      enabledLanguages,
      defaultLanguage: defaultCode,
      setLanguage,
    }),
    [t, language, info, enabledLanguages, defaultCode, setLanguage]
  );

  if (!isReady) return null;

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}
