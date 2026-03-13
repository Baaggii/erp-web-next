const requestCache = new Map();

export async function cachedFetch(url, options = {}) {
  if (requestCache.has(url)) {
    return requestCache.get(url);
  }

  const promise = fetch(url, {
    credentials: 'include',
    ...options,
  }).then((r) => r.json());

  requestCache.set(url, promise);

  return promise;
}

export function clearCachedFetch(url) {
  if (url) {
    requestCache.delete(url);
    return;
  }
  requestCache.clear();
}
