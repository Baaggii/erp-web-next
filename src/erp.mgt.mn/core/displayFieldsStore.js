import { cachedFetch } from './apiCache.js';

const displayCache = new Map();
const EMPTY_DISPLAY_CONFIG = { idField: null, displayFields: [] };

export async function getDisplayFields(table) {
  if (displayCache.has(table)) return displayCache.get(table);

  const data = await cachedFetch(`/api/display_fields?table=${table}`);
  displayCache.set(table, data);
  return data;
}

export async function getDisplayFieldsConfig(table) {
  try {
    const cfg = await getDisplayFields(table);
    return cfg && typeof cfg === 'object' ? cfg : EMPTY_DISPLAY_CONFIG;
  } catch {
    return EMPTY_DISPLAY_CONFIG;
  }
}
