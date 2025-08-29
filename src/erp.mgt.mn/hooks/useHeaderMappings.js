import { useContext, useEffect, useState } from 'react';
import LangContext from '../context/LangContext.jsx';

// Cache translations by "locale|header" so different locales don't collide
const cache = {};

export default function useHeaderMappings(headers = [], locale) {
  const { lang } = useContext(LangContext);
  const currentLang = locale || lang;
  const [map, setMap] = useState({});

  useEffect(() => {
    const unique = Array.from(new Set(headers.filter(Boolean)));
    if (unique.length === 0) {
      setMap({});
      return;
    }

    const keyFor = (h) => `${currentLang}|${h}`;
    const missing = unique.filter((h) => cache[keyFor(h)] === undefined);
    if (missing.length > 0) {
      const params = new URLSearchParams();
      params.set('headers', missing.join(','));
      if (currentLang) params.set('lang', currentLang);
      fetch(`/api/header_mappings?${params.toString()}`, { credentials: 'include' })
        .then((res) => (res.ok ? res.json() : {}))
        .then((data) => {
          Object.entries(data).forEach(([k, v]) => {
            cache[keyFor(k)] = v;
          });
          const result = {};
          unique.forEach((h) => {
            const val = cache[keyFor(h)];
            if (val !== undefined) result[h] = val;
          });
          setMap(result);
        })
        .catch(() => {
          const result = {};
          unique.forEach((h) => {
            const val = cache[keyFor(h)];
            if (val !== undefined) result[h] = val;
          });
          setMap(result);
        });
    } else {
      const result = {};
      unique.forEach((h) => {
        const val = cache[keyFor(h)];
        if (val !== undefined) result[h] = val;
      });
      setMap(result);
    }
  }, [headers.join(','), currentLang]);

  return map;
}
