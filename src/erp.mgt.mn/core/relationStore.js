import { cachedFetch } from './apiCache.js';

const relationCache = new Map();

export async function getRelations(table) {
  if (relationCache.has(table)) return relationCache.get(table);
  const data = await cachedFetch(`/api/tables/${encodeURIComponent(table)}/relations`);
  relationCache.set(table, data);
  return data;
}
