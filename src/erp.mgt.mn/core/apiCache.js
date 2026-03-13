const requestCache = new Map();

function buildKey(url, options = {}) {
  const method = String(options.method || 'GET').toUpperCase();
  return `${method}:${url}`;
}

export function clearApiCache(match = null) {
  if (!match) {
    requestCache.clear();
    return;
  }
  for (const key of requestCache.keys()) {
    if (key.includes(match)) requestCache.delete(key);
  }
}

export async function cachedFetch(url, options = {}) {
  const key = buildKey(url, options);
  if (requestCache.has(key)) return requestCache.get(key);

  const promise = fetch(url, {
    credentials: 'include',
    ...options,
  })
    .then(async (r) => {
      if (!r.ok) throw new Error(`Request failed: ${r.status} ${url}`);
      return r.json();
    })
    .catch((err) => {
      requestCache.delete(key);
      throw err;
    });

  requestCache.set(key, promise);
  return promise;
}
