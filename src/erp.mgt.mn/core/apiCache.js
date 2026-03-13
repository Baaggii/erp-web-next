const cache = new Map();

export function clearApiCache(url) {
  if (url) {
    cache.delete(url);
    return;
  }
  cache.clear();
}

export async function cachedFetch(url, options = {}, staleTime = 0) {
  const now = Date.now();
  const cached = cache.get(url);

  if (cached && (!staleTime || now - cached.timestamp < staleTime)) {
    return cached.promise;
  }

  const promise = fetch(url, options)
    .then((r) => (r.ok ? r.json() : {}))
    .catch((err) => {
      cache.delete(url);
      throw err;
    });

  cache.set(url, { promise, timestamp: now });
  return promise;
}
