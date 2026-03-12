import { useEffect, useMemo, useState } from 'react';

const bundleCache = new Map();

function buildKey(url, params = {}) {
  const search = new URLSearchParams();
  Object.entries(params || {}).forEach(([key, value]) => {
    if (value === undefined || value === null || value === '') return;
    search.set(key, String(value));
  });
  const query = search.toString();
  return query ? `${url}?${query}` : url;
}

export default function useBundleResource(url, params = {}, { enabled = true } = {}) {
  const key = useMemo(() => buildKey(url, params), [url, JSON.stringify(params)]);
  const [state, setState] = useState(() => ({
    data: bundleCache.get(key) || null,
    loading: enabled,
    error: null,
  }));

  useEffect(() => {
    let cancelled = false;
    if (!enabled) {
      setState((prev) => ({ ...prev, loading: false }));
      return undefined;
    }

    if (bundleCache.has(key)) {
      setState({ data: bundleCache.get(key), loading: false, error: null });
      return undefined;
    }

    setState((prev) => ({ ...prev, loading: true, error: null }));
    fetch(key, { credentials: 'include', skipLoader: true })
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error(`Failed request: ${res.status}`))))
      .then((data) => {
        if (cancelled) return;
        bundleCache.set(key, data);
        setState({ data, loading: false, error: null });
      })
      .catch((error) => {
        if (cancelled) return;
        setState({ data: null, loading: false, error });
      });

    return () => {
      cancelled = true;
    };
  }, [key, enabled]);

  return state;
}

export function clearBundleResourceCache() {
  bundleCache.clear();
}
