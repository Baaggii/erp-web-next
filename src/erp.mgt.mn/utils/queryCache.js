const queryStore = new Map();

export function invalidateQueryCache(prefix) {
  if (!prefix) {
    queryStore.clear();
    return;
  }
  for (const key of queryStore.keys()) {
    if (key === prefix || key.startsWith(`${prefix}:`)) {
      queryStore.delete(key);
    }
  }
}

export async function getOrFetchQuery(key, fetcher) {
  const existing = queryStore.get(key);
  if (existing?.status === 'fulfilled') {
    return existing.data;
  }
  if (existing?.status === 'pending') {
    return existing.promise;
  }

  const promise = Promise.resolve()
    .then(fetcher)
    .then((data) => {
      queryStore.set(key, { status: 'fulfilled', data });
      return data;
    })
    .catch((error) => {
      queryStore.delete(key);
      throw error;
    });

  queryStore.set(key, { status: 'pending', promise });
  return promise;
}
