import { useEffect, useMemo, useState } from 'react';

const queryStore = new Map();

function serializeKey(queryKey) {
  return JSON.stringify(Array.isArray(queryKey) ? queryKey : [queryKey]);
}

function ensureEntry(queryKey) {
  const key = serializeKey(queryKey);
  if (!queryStore.has(key)) {
    queryStore.set(key, {
      data: undefined,
      error: null,
      updatedAt: 0,
      promise: null,
      listeners: new Set(),
      gcTimer: null,
    });
  }
  return { key, entry: queryStore.get(key) };
}

function notify(entry) {
  entry.listeners.forEach((listener) => listener(entry.data, entry.error));
}

function scheduleGc(key, entry, cacheTime) {
  if (entry.gcTimer) clearTimeout(entry.gcTimer);
  entry.gcTimer = setTimeout(() => {
    if (!entry.listeners.size && !entry.promise) queryStore.delete(key);
  }, Math.max(cacheTime, 0));
}

export async function fetchQuery({ queryKey, queryFn, staleTime = 0, cacheTime = 5 * 60_000, force = false }) {
  const { key, entry } = ensureEntry(queryKey);
  const now = Date.now();
  const fresh = !force && entry.updatedAt > 0 && now - entry.updatedAt <= staleTime;

  if (fresh) return entry.data;
  if (entry.promise) return entry.promise;

  entry.promise = Promise.resolve()
    .then(queryFn)
    .then((data) => {
      entry.data = data;
      entry.error = null;
      entry.updatedAt = Date.now();
      notify(entry);
      scheduleGc(key, entry, cacheTime);
      return data;
    })
    .catch((error) => {
      entry.error = error;
      notify(entry);
      throw error;
    })
    .finally(() => {
      entry.promise = null;
    });

  return entry.promise;
}

export function setQueryData(queryKey, data) {
  const { key, entry } = ensureEntry(queryKey);
  entry.data = data;
  entry.error = null;
  entry.updatedAt = Date.now();
  notify(entry);
  scheduleGc(key, entry, 30 * 60_000);
}

export function invalidateQuery(queryKey) {
  const { entry } = ensureEntry(queryKey);
  entry.updatedAt = 0;
}

export function subscribeQuery(queryKey, listener) {
  const { key, entry } = ensureEntry(queryKey);
  entry.listeners.add(listener);
  return () => {
    entry.listeners.delete(listener);
    if (!entry.listeners.size) scheduleGc(key, entry, 5 * 60_000);
  };
}

export function useApiQuery({
  queryKey,
  queryFn,
  enabled = true,
  staleTime = 0,
  cacheTime = 5 * 60_000,
  initialData,
}) {
  const stableKey = useMemo(() => queryKey, [JSON.stringify(queryKey)]);
  const [state, setState] = useState(() => {
    const { entry } = ensureEntry(stableKey);
    if (entry.data === undefined && initialData !== undefined) {
      entry.data = initialData;
      entry.updatedAt = Date.now();
    }
    return {
      data: entry.data,
      isLoading: enabled && entry.data === undefined,
      error: entry.error,
    };
  });

  useEffect(() => {
    if (!enabled) return () => {};
    let mounted = true;

    const stop = subscribeQuery(stableKey, (data, error) => {
      if (!mounted) return;
      setState({ data, error, isLoading: false });
    });

    fetchQuery({ queryKey: stableKey, queryFn, staleTime, cacheTime })
      .then((data) => {
        if (!mounted) return;
        setState({ data, error: null, isLoading: false });
      })
      .catch((error) => {
        if (!mounted) return;
        setState((prev) => ({ ...prev, error, isLoading: false }));
      });

    return () => {
      mounted = false;
      stop();
    };
  }, [enabled, stableKey, queryFn, staleTime, cacheTime]);

  return state;
}
