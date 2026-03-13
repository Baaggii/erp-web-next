import { cachedFetch } from './apiCache.js';

const DEFAULT_DISPLAY_FIELDS = Object.freeze({ idField: null, displayFields: [] });

export async function fetchDisplayFields(table, extras = {}) {
  if (!table) return DEFAULT_DISPLAY_FIELDS;
  const params = new URLSearchParams({ table, ...extras });
  try {
    return await cachedFetch(`/api/display_fields?${params.toString()}`);
  } catch {
    return DEFAULT_DISPLAY_FIELDS;
  }
}
