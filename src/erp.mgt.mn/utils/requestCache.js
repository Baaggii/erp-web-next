const responseCache = new Map();
const inFlightRequests = new Map();

function cacheKey(url, options = {}) {
  const method = String(options.method || 'GET').toUpperCase();
  return `${method}:${url}`;
}

export async function withRequestCache(url, options = {}, config = {}) {
  const {
    ttlMs = 30_000,
    forceRefresh = false,
    parser = async (res) => res.json(),
  } = config;
  const key = cacheKey(url, options);
  const now = Date.now();

  if (!forceRefresh) {
    const cached = responseCache.get(key);
    if (cached && cached.expiresAt > now) {
      return cached.value;
    }
    if (inFlightRequests.has(key)) {
      return inFlightRequests.get(key);
    }
  }

  const requestPromise = fetch(url, options)
    .then(async (res) => {
      if (!res.ok) {
        throw new Error(`Request failed: ${res.status}`);
      }
      const parsed = await parser(res);
      responseCache.set(key, {
        value: parsed,
        expiresAt: now + ttlMs,
      });
      return parsed;
    })
    .finally(() => {
      inFlightRequests.delete(key);
    });

  inFlightRequests.set(key, requestPromise);
  return requestPromise;
}

export function clearRequestCache(match = null) {
  if (!match) {
    responseCache.clear();
    inFlightRequests.clear();
    return;
  }

  for (const key of responseCache.keys()) {
    if (key.includes(match)) responseCache.delete(key);
  }
  for (const key of inFlightRequests.keys()) {
    if (key.includes(match)) inFlightRequests.delete(key);
  }
}
