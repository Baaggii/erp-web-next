import { useEffect, useState } from 'react';

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

  useEffect(() => {
    if (cache.data !== null) {
      setCfg(cache.data);
      if (cache.data.general) {
        window.erpDebug = !!cache.data.general.debugLoggingEnabled;
      }
    } else {
      fetch('/api/general_config', { credentials: 'include' })
        .then(res => (res.ok ? res.json() : {}))
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
