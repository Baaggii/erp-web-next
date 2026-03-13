import { cachedFetch } from './apiCache.js';

const displayCache = new Map();

export async function getDisplayFields(table) {
  if (displayCache.has(table)) return displayCache.get(table);
  const data = await cachedFetch(`/api/display_fields?table=${encodeURIComponent(table)}`);
  displayCache.set(table, data);
  return data;
}
