import React, {
  createContext,
  useState,
  useEffect,
  useMemo,
  useCallback,
  useContext,
} from 'react';
import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import { AuthContext } from './AuthContext.jsx';

export const I18nContext = createContext({
  lang: 'en',
  setLang: () => {},
  fallbackLangs: ['en'],
  t: (key, fallback) => fallback || key,
});

export function I18nProvider({ children }) {
  const { userSettings, updateUserSettings, company } = useContext(AuthContext);
  const allLangs = ['en', 'mn', 'ja', 'ko', 'zh', 'es', 'de', 'fr', 'ru'];
  const getInitialLang = () =>
    allLangs.includes(userSettings?.lang) ? userSettings.lang : 'en';
  const [lang, setLang] = useState(getInitialLang);
  const [tick, setTick] = useState(0);
  // Define a fallback order for languages, excluding the active language.
  const fallbackLangs = useMemo(
    () => allLangs.filter((l) => l !== lang),
    [lang]
  );

  const changeLang = useCallback(
    async (newLang) => {
      if (!allLangs.includes(newLang)) return;

      async function fetchLocale(lang, type = '') {
        const ids = company != null ? [company, 0] : [0];
        for (const id of ids) {
          try {
            const res = await fetch(
              `/config/${id}/locales${type === 'tooltip' ? '/tooltips' : ''}/${lang}.json`,
            );
            if (res.ok) return await res.json();
          } catch {}
        }
        return {};
      }

      const [translations, tooltipFile] = await Promise.all([
        fetchLocale(newLang),
        fetchLocale(newLang, 'tooltip'),
      ]);
      const newFallback = allLangs.filter((l) => l !== newLang);

      if (!i18n.isInitialized) {
        await i18n.use(initReactI18next).init({
          resources: {
            [newLang]: {
              translation: translations,
              tooltip: tooltipFile,
            },
          },
          lng: newLang,
          fallbackLng: newFallback,
          interpolation: { escapeValue: false },
        });
      } else {
        i18n.addResourceBundle(
          newLang,
          'translation',
          translations,
          true,
          true
        );
        i18n.addResourceBundle(
          newLang,
          'tooltip',
          tooltipFile,
          true,
          true
        );
        await i18n.changeLanguage(newLang);
        i18n.options.fallbackLng = newFallback;
      }

      updateUserSettings({ lang: newLang });
      setLang(newLang);
      setTick((t) => t + 1);
    },
    [updateUserSettings, company]
  );

  useEffect(() => {
    changeLang(lang);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [company]);

  useEffect(() => {
    if (userSettings?.lang && userSettings.lang !== lang) {
      setLang(userSettings.lang);
      changeLang(userSettings.lang);
    }
  }, [userSettings?.lang, lang, changeLang]);

  const value = useMemo(
    () => ({
      lang,
      setLang: changeLang,
      fallbackLangs,
      t: (key, fallback, options = {}) =>
        i18n.t(key, {
          ns: options.ns || ['translation', 'tooltip'],
          defaultValue: fallback ?? key,
        }),
    }),
    [lang, changeLang, fallbackLangs, tick]
  );

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export default I18nContext;
