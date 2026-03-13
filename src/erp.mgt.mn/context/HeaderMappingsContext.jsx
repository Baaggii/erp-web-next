import React, { createContext, useEffect, useMemo, useState } from 'react';
import { cachedFetch } from '../utils/cachedFetch.js';

export const HeaderMappingsContext = createContext({
  mappings: {},
  loaded: false,
});

export function HeaderMappingsProvider({ children }) {
  const [mappings, setMappings] = useState({});
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;

    cachedFetch('/api/header_mappings?lang=en', { credentials: 'include', skipLoader: true }, { ttlMs: 60_000 })
      .then((data) => {
        if (cancelled) return;
        setMappings(data && typeof data === 'object' ? data : {});
      })
      .catch(() => {
        if (!cancelled) setMappings({});
      })
      .finally(() => {
        if (!cancelled) setLoaded(true);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const value = useMemo(() => ({ mappings, loaded }), [mappings, loaded]);

  return <HeaderMappingsContext.Provider value={value}>{children}</HeaderMappingsContext.Provider>;
}
