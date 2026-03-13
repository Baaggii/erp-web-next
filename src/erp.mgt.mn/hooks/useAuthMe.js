import { API_BASE } from '../utils/apiBase.js';
import normalizeEmploymentSession from '../utils/normalizeEmploymentSession.js';
import { fetchQuery, useApiQuery } from './apiQueryCache.js';

const AUTH_ME_QUERY_KEY = ['auth', 'me'];

export async function fetchAuthMeCached({ force = false } = {}) {
  return fetchQuery({
    queryKey: AUTH_ME_QUERY_KEY,
    staleTime: 60_000,
    cacheTime: 10 * 60_000,
    force,
    queryFn: async () => {
      const res = await fetch(`${API_BASE}/auth/me`, { credentials: 'include' });
      if (!res.ok) throw new Error('Not authenticated');
      const data = await res.json();
      const normalizedSession = normalizeEmploymentSession(data?.session);
      return normalizedSession ? { ...data, session: normalizedSession } : data;
    },
  });
}

export function useAuthMe(options = {}) {
  return useApiQuery({
    queryKey: AUTH_ME_QUERY_KEY,
    staleTime: 60_000,
    cacheTime: 10 * 60_000,
    queryFn: () => fetchAuthMeCached(),
    ...options,
  });
}
