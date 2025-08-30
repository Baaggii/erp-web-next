import React, {
  createContext,
  useState,
  useEffect,
  useMemo,
  useCallback,
} from 'react';
import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';

export const I18nContext = createContext({
  lang: 'en',
  setLang: () => {},
  fallbackLangs: ['en'],
  t: (key, fallback) => fallback || key,
});

export function I18nProvider({ children }) {
  const allLangs = ['en', 'mn', 'ja', 'ko', 'zh', 'es', 'de', 'fr', 'ru'];
  const getInitialLang = () => {
    const stored = localStorage.getItem('lang');
    return allLangs.includes(stored) ? stored : 'en';
  };
  const [lang, setLang] = useState(getInitialLang);
  const [tick, setTick] = useState(0);
  // Define a fallback order for languages, excluding the active language.
  const fallbackLangs = useMemo(
    () => allLangs.filter((l) => l !== lang),
    [lang]
  );

  const changeLang = useCallback(async (newLang) => {
    if (!allLangs.includes(newLang)) return;

    const translations = await import(`../locales/${newLang}.json`);
    const newFallback = allLangs.filter((l) => l !== newLang);

    if (!i18n.isInitialized) {
      await i18n.use(initReactI18next).init({
        resources: {
          [newLang]: { translation: translations.default },
        },
        lng: newLang,
        fallbackLng: newFallback,
        interpolation: { escapeValue: false },
      });
    } else {
      i18n.addResourceBundle(
        newLang,
        'translation',
        translations.default,
        true,
        true
      );
      await i18n.changeLanguage(newLang);
      i18n.options.fallbackLng = newFallback;
    }

    localStorage.setItem('lang', newLang);
    setLang(newLang);
    setTick((t) => t + 1);
  }, []);

  useEffect(() => {
    changeLang(lang);
  }, []);

  const value = useMemo(
    () => ({
      lang,
      setLang: changeLang,
      fallbackLangs,
      t: (key, fallback) => i18n.t(key, { defaultValue: fallback ?? key }),
    }),
    [lang, changeLang, fallbackLangs, tick]
  );

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export default I18nContext;
