import { cachedFetch } from './apiCache.js';

const headerCache = new Map();

export async function getHeaderMappings(headers, lang = 'en') {
  const key = headers.join(',');

  if (headerCache.has(key)) return headerCache.get(key);

  const data = await cachedFetch(
    `/api/header_mappings?headers=${key}&lang=${lang}`,
  );

  headerCache.set(key, data);

  return data;
}

export function clearHeaderMappingStore() {
  headerCache.clear();
}
