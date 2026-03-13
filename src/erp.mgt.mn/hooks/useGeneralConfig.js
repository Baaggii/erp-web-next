import { useEffect } from 'react';
import { setQueryData, useApiQuery } from './apiQueryCache.js';

const QUERY_KEY = ['general_config'];

export function updateCache(data) {
  setQueryData(QUERY_KEY, data);
  if (data?.general) {
    window.erpDebug = !!data.general.debugLoggingEnabled;
  }
  window.dispatchEvent(new CustomEvent('generalConfigUpdated', { detail: data }));
}

export default function useGeneralConfig() {
  const { data } = useApiQuery({
    queryKey: QUERY_KEY,
    staleTime: 10 * 60_000,
    cacheTime: 30 * 60_000,
    queryFn: async () => {
      const res = await fetch('/api/general_config', { credentials: 'include' });
      const next = res.ok ? await res.json() : {};
      if (next?.general) {
        window.erpDebug = !!next.general.debugLoggingEnabled;
      }
      return next;
    },
  });

  useEffect(() => {
    const handler = (e) => {
      if (e.detail?.general) {
        window.erpDebug = !!e.detail.general.debugLoggingEnabled;
      }
    };
    window.addEventListener('generalConfigUpdated', handler);
    return () => window.removeEventListener('generalConfigUpdated', handler);
  }, []);

  return data || {};
}
