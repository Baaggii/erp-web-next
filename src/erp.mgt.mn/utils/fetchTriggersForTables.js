function isPlainRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

export function fetchTriggersForTables({
  tables,
  fetcher,
  fetchesRef,
  loadedRef,
  applyResult = () => true,
}) {
  if (!Array.isArray(tables) || typeof fetcher !== 'function') return [];

  const promises = [];
  const fetchStore = fetchesRef?.current instanceof Map ? fetchesRef.current : null;
  const loadedStore = loadedRef?.current instanceof Set ? loadedRef.current : null;

  tables.forEach((rawTable) => {
    const tbl = typeof rawTable === 'string' ? rawTable : String(rawTable || '');
    if (!tbl) return;
    if (loadedStore && loadedStore.has(tbl)) return;

    let promise = fetchStore ? fetchStore.get(tbl) : null;
    if (!promise) {
      promise = Promise.resolve()
        .then(() => fetcher(tbl))
        .catch(() => ({}))
        .then((result) => {
          const data = isPlainRecord(result) ? result : {};
          const accepted = applyResult(tbl, data);
          if (loadedStore) {
            if (accepted === false) loadedStore.delete(tbl);
            else loadedStore.add(tbl);
          }
          return data;
        })
        .finally(() => {
          if (fetchStore) fetchStore.delete(tbl);
        });
      if (fetchStore) fetchStore.set(tbl, promise);
    }

    promises.push(promise);
  });

  return promises;
}
