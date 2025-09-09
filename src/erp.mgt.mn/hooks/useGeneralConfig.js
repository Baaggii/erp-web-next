import { useEffect, useState } from 'react';

const cache = { data: null };

export function updateCache(data) {
  cache.data = { ...data, isDefault: data?.isDefault ?? false };
  if (cache.data?.general) {
    window.erpDebug = !!cache.data.general.debugLoggingEnabled;
  }
  window.dispatchEvent(
    new CustomEvent('generalConfigUpdated', { detail: cache.data }),
  );
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
        .then(res => (res.ok ? res.json() : { isDefault: true }))
        .then(data => {
          updateCache(data);
          setCfg(cache.data);
        })
        .catch(() => setCfg({ isDefault: true }));
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

  return cfg || { isDefault: true };
}
