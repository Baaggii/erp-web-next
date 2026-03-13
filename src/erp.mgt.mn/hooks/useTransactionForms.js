import { fetchQuery, useApiQuery } from './apiQueryCache.js';

async function requestTransactionForms(query = '', { skipLoader = false } = {}) {
  const url = `/api/transaction_forms${query ? `?${query}` : ''}`;
  const res = await fetch(url, { credentials: 'include', skipLoader });
  return res.ok ? res.json() : {};
}

export function fetchTransactionFormsCached(query = '', options = {}) {
  return fetchQuery({
    queryKey: ['transaction_forms', query || 'all'],
    staleTime: 5 * 60_000,
    cacheTime: 20 * 60_000,
    queryFn: () => requestTransactionForms(query, options),
  });
}

export function useTransactionForms(query = '', options = {}) {
  return useApiQuery({
    queryKey: ['transaction_forms', query || 'all'],
    staleTime: 5 * 60_000,
    cacheTime: 20 * 60_000,
    queryFn: () => requestTransactionForms(query, options),
    ...options,
  });
}
