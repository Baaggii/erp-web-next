import { useEffect, useRef, useState } from 'react';
import { cachedFetch } from '../core/apiCache.js';

const cache = { data: null };

export function updateCache(data) {
  cache.data = data;
  if (data?.general) {
    window.erpDebug = !!data.general.debugLoggingEnabled;
  }
  window.dispatchEvent(new CustomEvent('generalConfigUpdated', { detail: data }));
}

export default function useGeneralConfig() {
  const [cfg, setCfg] = useState(cache.data);

  const loaded = useRef(false);

  useEffect(() => {
    if (loaded.current) return;
    loaded.current = true;
    if (cache.data !== null) {
      setCfg(cache.data);
      if (cache.data.general) {
        window.erpDebug = !!cache.data.general.debugLoggingEnabled;
      }
    } else {
      cachedFetch('/api/general_config')
        .then(data => {
          updateCache(data);
          setCfg(data);
        })
        .catch(() => setCfg({}));
    }
    const handler = e => {
      setCfg(e.detail);
      if (e.detail?.general) {
        window.erpDebug = !!e.detail.general.debugLoggingEnabled;
      }
    };
    window.addEventListener('generalConfigUpdated', handler);
    return () => window.removeEventListener('generalConfigUpdated', handler);
  }, []);

  return cfg || {};
}
