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
  const [lang, setLang] = useState(() => localStorage.getItem('lang') || 'en');
  // Define a fallback order for languages. If a translation is missing in the
  // active language, we will try these in order.
  const fallbackLangs = ['mn', 'en'];

  const changeLang = useCallback(
    async (newLang) => {
      const translations = await import(`../locales/${newLang}.json`);

      if (!i18n.isInitialized) {
        await i18n.use(initReactI18next).init({
          resources: {
            [newLang]: { translation: translations.default },
          },
          lng: newLang,
          fallbackLng: fallbackLangs,
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
        i18n.changeLanguage(newLang);
        i18n.options.fallbackLng = fallbackLangs;
      }

      localStorage.setItem('lang', newLang);
      setLang(newLang);
    },
    [fallbackLangs]
  );

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
    [lang, changeLang]
  );

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export default I18nContext;
