import React, { createContext, useState, useEffect, useMemo } from 'react';
import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';

export const I18nContext = createContext({
  lang: 'en',
  setLang: () => {},
  fallbackLangs: ['en'],
  t: (key, fallback) => fallback || key,
});

export function I18nProvider({ children }) {
  const [lang, setLang] = useState(() => localStorage.getItem('lang') || 'en');
  // Define a fallback order for languages. If a translation is missing in the
  // active language, we will try these in order.
  const fallbackLangs = ['mn', 'en'];

  useEffect(() => {
    localStorage.setItem('lang', lang);
  }, [lang]);

  useEffect(() => {
    async function load() {
      const translations = await import(`../locales/${lang}.json`);
      if (!i18n.isInitialized) {
        i18n.use(initReactI18next).init({
          resources: {
            [lang]: { translation: translations.default },
          },
          lng: lang,
          fallbackLng: fallbackLangs,
          interpolation: { escapeValue: false },
        });
      } else {
        i18n.addResourceBundle(lang, 'translation', translations.default, true, true);
        i18n.changeLanguage(lang);
        i18n.options.fallbackLng = fallbackLangs;
      }
    }
    load();
  }, [lang]);

  const value = useMemo(
    () => ({
      lang,
      setLang,
      fallbackLangs,
      t: (key, fallback) => i18n.t(key, { defaultValue: fallback ?? key }),
    }),
    [lang]
  );

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export default I18nContext;
