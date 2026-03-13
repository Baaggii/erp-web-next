import { cachedFetch } from './apiCache.js';

export async function fetchTableRelations(table) {
  if (!table) return [];
  return cachedFetch(`/api/tables/${encodeURIComponent(table)}/relations`);
}
