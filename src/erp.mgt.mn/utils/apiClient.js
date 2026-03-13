import { withRequestCache } from './requestCache.js';

function buildFetchOptions(options = {}) {
  return {
    credentials: 'include',
    ...options,
  };
}

export async function apiGetJson(url, options = {}) {
  const res = await fetch(url, buildFetchOptions(options));
  if (!res.ok) {
    throw new Error(`GET ${url} failed: ${res.status}`);
  }
  return res.json();
}

export function apiGetJsonCached(url, options = {}, cache = {}) {
  return withRequestCache(url, buildFetchOptions(options), {
    ttlMs: cache.ttlMs ?? 30_000,
    forceRefresh: cache.forceRefresh ?? false,
    parser: async (res) => res.json(),
  });
}
