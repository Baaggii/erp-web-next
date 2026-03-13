import { useContext, useEffect, useState } from 'react';
import I18nContext from '../context/I18nContext.jsx';
import { cachedFetch } from '../core/apiCache.js';

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

export default function useHeaderMappings(headers = [], locale, options = {}) {
  const { lang, fallbackLangs } = useContext(I18nContext);
  const currentLang = locale || lang;
  const [map, setMap] = useState({});
  const [tick, setTick] = useState(0);
  const { enabled = true } = options;

  // Re-fetch when the cache is cleared elsewhere.
  useEffect(() => {
    const fn = () => setTick((t) => t + 1);
    listeners.add(fn);
    return () => listeners.delete(fn);
  }, []);

  useEffect(() => {
    if (!enabled) {
      setMap({});
      return;
    }

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
          const params = new URLSearchParams();
          params.set('headers', missing.join(','));
          if (lng) params.set('lang', lng);
          try {
            const data = await cachedFetch(
              `/api/header_mappings?${params.toString()}`,
              { credentials: 'include' },
              30 * 60 * 1000,
            );
            Object.entries(data).forEach(([k, v]) => {
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
    enabled,
  ]);

  return map;
}
