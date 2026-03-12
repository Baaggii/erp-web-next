const cacheStore = new Map();

function nowMs() {
  return Date.now();
}

function isExpired(entry) {
  return !entry || (entry.expiresAt && entry.expiresAt <= nowMs());
}

export function getCache(key) {
  const entry = cacheStore.get(key);
  if (!entry) return null;
  if (isExpired(entry)) {
    cacheStore.delete(key);
    return null;
  }
  return entry;
}

export function setCache(key, value, ttlSeconds = 60) {
  const ttl = Number(ttlSeconds);
  const expiresAt = Number.isFinite(ttl) && ttl > 0 ? nowMs() + ttl * 1000 : null;
  cacheStore.set(key, {
    value,
    expiresAt,
    ttlSeconds: Number.isFinite(ttl) && ttl > 0 ? ttl : 0,
    generatedAt: new Date().toISOString(),
  });
}

export function invalidateCacheByPrefix(prefixes = []) {
  const list = Array.isArray(prefixes) ? prefixes : [prefixes];
  let removed = 0;
  for (const key of cacheStore.keys()) {
    if (list.some((prefix) => prefix && key.startsWith(prefix))) {
      cacheStore.delete(key);
      removed += 1;
    }
  }
  return removed;
}

export function cacheGetOrSet(key, ttlSeconds, producer) {
  const hit = getCache(key);
  if (hit) {
    return Promise.resolve({
      value: hit.value,
      hit: true,
      ttlSeconds: hit.ttlSeconds,
      generatedAt: hit.generatedAt,
    });
  }

  return Promise.resolve(producer()).then((value) => {
    setCache(key, value, ttlSeconds);
    return {
      value,
      hit: false,
      ttlSeconds,
      generatedAt: new Date().toISOString(),
    };
  });
}
