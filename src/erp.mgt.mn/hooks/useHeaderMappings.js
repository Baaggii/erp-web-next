import { useContext, useEffect, useState } from 'react';
import { getHeaderMappings as getHeaderMappingsCached } from '../core/headerMappingStore.js';
import I18nContext from '../context/I18nContext.jsx';

// Cache translations by "locale|header" so different locales don't collide.
const cache = {};
const listeners = new Set();

// Allow external callers to clear the cache and trigger a refresh.
export function clearHeaderMappingsCache(headers) {
  if (!headers) {
    Object.keys(cache).forEach((k) => delete cache[k]);
  } else {
    Object.keys(cache).forEach((k) => {
      if (headers.some((h) => k.endsWith(`|${h}`))) delete cache[k];
    });
  }
  listeners.forEach((fn) => fn());
}

export default function useHeaderMappings(headers = [], locale) {
  const { lang, fallbackLangs } = useContext(I18nContext);
  const currentLang = locale || lang;
  const [map, setMap] = useState({});
  const [tick, setTick] = useState(0);

  // Re-fetch when the cache is cleared elsewhere.
  useEffect(() => {
    const fn = () => setTick((t) => t + 1);
    listeners.add(fn);
    return () => listeners.delete(fn);
  }, []);

  useEffect(() => {
    const unique = Array.from(new Set(headers.filter(Boolean)));
    if (unique.length === 0) {
      setMap({});
      return;
    }

    const langsToTry = [currentLang, ...(fallbackLangs || [])];

    const result = {};

    async function load() {
      for (const lng of langsToTry) {
        const keyFor = (h) => `${lng}|${h}`;
        const missing = unique.filter((h) => cache[keyFor(h)] === undefined);
        if (missing.length > 0) {
          try {
            const data = await getHeaderMappingsCached(missing, lng || 'en');
            Object.entries(data || {}).forEach(([k, v]) => {
              cache[keyFor(k)] = v;
            });
          } catch {
            // ignore network errors
          }
        }
        unique.forEach((h) => {
          const val = cache[keyFor(h)];
          if (val !== undefined && result[h] === undefined) result[h] = val;
        });
        const unresolved = unique.filter((h) => result[h] === undefined);
        if (unresolved.length === 0) break;
      }
      setMap(result);
    }

    load();
  }, [
    headers.join(','),
    currentLang,
    (fallbackLangs || []).join(','),
    tick,
  ]);

  return map;
}
