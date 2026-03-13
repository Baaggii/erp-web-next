import { fetchQuery, useApiQuery } from './apiQueryCache.js';

async function requestDisplayFields(table) {
  const res = await fetch(`/api/display_fields?table=${encodeURIComponent(table)}`, {
    credentials: 'include',
  });
  return res.ok ? res.json() : { idField: null, displayFields: [] };
}

export function fetchDisplayFieldsCached(table) {
  return fetchQuery({
    queryKey: ['display_fields', table],
    staleTime: 10 * 60_000,
    cacheTime: 30 * 60_000,
    queryFn: () => requestDisplayFields(table),
  });
}

export function useDisplayFields(table, options = {}) {
  return useApiQuery({
    queryKey: ['display_fields', table],
    enabled: Boolean(table) && (options.enabled ?? true),
    staleTime: 10 * 60_000,
    cacheTime: 30 * 60_000,
    queryFn: () => requestDisplayFields(table),
    ...options,
  });
}
