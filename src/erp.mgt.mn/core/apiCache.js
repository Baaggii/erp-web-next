const requestCache = new Map();

function buildCacheKey(url, options = {}) {
  const { method = 'GET', body, headers } = options;
  const headerEntries = headers
    ? Object.entries(headers).sort(([a], [b]) => a.localeCompare(b))
    : [];
  return JSON.stringify([url, method, body ?? null, headerEntries]);
}

export async function cachedFetch(url, options = {}) {
  const cacheKey = buildCacheKey(url, options);
  if (requestCache.has(cacheKey)) {
    return requestCache.get(cacheKey);
  }

  const promise = fetch(url, {
    credentials: 'include',
    ...options,
  }).then(async (response) => {
    if (!response.ok) {
      throw new Error(`Request failed: ${response.status}`);
    }
    return response.json();
  });

  requestCache.set(cacheKey, promise);
  return promise;
}

export function clearCachedFetch(urlPrefix = '') {
  if (!urlPrefix) {
    requestCache.clear();
    return;
  }
  for (const key of requestCache.keys()) {
    if (key.includes(urlPrefix)) {
      requestCache.delete(key);
    }
  }
}
