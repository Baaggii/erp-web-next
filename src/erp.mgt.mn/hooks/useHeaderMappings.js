import { useContext, useEffect, useState } from 'react';
import I18nContext from '../context/I18nContext.jsx';
import {
  getHeaderMappings,
  clearHeaderMappingStore,
} from '../core/headerMappingStore.js';

const listeners = new Set();

export function clearHeaderMappingsCache() {
  clearHeaderMappingStore();
  listeners.forEach((fn) => fn());
}

export default function useHeaderMappings(headers = [], locale) {
  const { lang } = useContext(I18nContext);
  const currentLang = locale || lang || 'en';
  const [map, setMap] = useState({});
  const [tick, setTick] = useState(0);

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

    let cancelled = false;
    getHeaderMappings(unique, currentLang)
      .then((data) => {
        if (!cancelled) setMap(data && typeof data === 'object' ? data : {});
      })
      .catch(() => {
        if (!cancelled) setMap({});
      });

    return () => {
      cancelled = true;
    };
  }, [headers.join(','), currentLang, tick]);

  return map;
}
