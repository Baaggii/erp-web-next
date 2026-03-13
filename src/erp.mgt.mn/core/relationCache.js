const relationCache = new Map();
const relationPromises = new Map();

function normalizeRelationList(list) {
  const map = {};
  if (!Array.isArray(list)) return map;
  list.forEach((entry) => {
    const col = entry?.COLUMN_NAME;
    const refTable = entry?.REFERENCED_TABLE_NAME;
    const refColumn = entry?.REFERENCED_COLUMN_NAME;
    if (!col || !refTable || !refColumn) return;
    map[String(col).toLowerCase()] = {
      table: refTable,
      column: refColumn,
      filterColumn: entry?.filterColumn,
      filterValue: entry?.filterValue,
    };
  });
  return map;
}

export async function getTableRelations(tableName) {
  const cacheKey = String(tableName || '').trim().toLowerCase();
  if (!cacheKey) return {};
  if (relationCache.has(cacheKey)) return relationCache.get(cacheKey);
  if (relationPromises.has(cacheKey)) return relationPromises.get(cacheKey);

  const request = fetch(`/api/tables/${encodeURIComponent(tableName)}/relations`, {
    credentials: 'include',
    skipErrorToast: true,
    skipLoader: true,
  })
    .then(async (res) => {
      if (!res.ok) return {};
      const list = await res.json().catch(() => []);
      return normalizeRelationList(list);
    })
    .catch(() => ({}))
    .then((map) => {
      relationCache.set(cacheKey, map);
      return map;
    })
    .finally(() => {
      relationPromises.delete(cacheKey);
    });

  relationPromises.set(cacheKey, request);
  return request;
}

export function clearRelationCache() {
  relationCache.clear();
  relationPromises.clear();
}
