import React, { createContext, useState, useEffect, useMemo } from 'react';
import translations from './translations.json';
// translations.json structure: { "key": { "mn": "...", "en": "...", ... } }

export const LangContext = createContext({
  lang: 'en',
  setLang: () => {},
  t: (key, fallback) => fallback || key,
});

export function LangProvider({ children }) {
  const [lang, setLang] = useState(() => localStorage.getItem('lang') || 'en');

  useEffect(() => {
    localStorage.setItem('lang', lang);
  }, [lang]);

  const t = useMemo(() => {
    return (key, fallback = key) => {
      const entry = translations[key];
      if (!entry) return fallback;
      return entry[lang] || entry.en || fallback;
    };
  }, [lang]);

  const value = useMemo(() => ({ lang, setLang, t }), [lang, t]);

  return <LangContext.Provider value={value}>{children}</LangContext.Provider>;
}

export default LangContext;

