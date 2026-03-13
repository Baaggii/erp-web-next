import { withRequestCache } from './requestCache.js';

export function cachedFetch(url, options = {}, cache = {}) {
  const parser = cache.parser || (async (res) => res.json());
  return withRequestCache(url, options, {
    ttlMs: cache.ttlMs ?? 30_000,
    forceRefresh: cache.forceRefresh ?? false,
    parser,
  });
}
