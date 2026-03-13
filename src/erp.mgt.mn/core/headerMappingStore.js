import { cachedFetch } from './apiCache.js';

const headerCache = {};

export async function getHeaderMappings(headers = [], lang = 'en') {
  const normalized = Array.from(new Set((headers || []).filter(Boolean)));
  const key = `${lang}:${normalized.join(',')}`;
  if (headerCache[key]) return headerCache[key];
  const result = await cachedFetch(`/api/header_mappings?headers=${encodeURIComponent(normalized.join(','))}&lang=${encodeURIComponent(lang)}`);
  headerCache[key] = result;
  return result;
}
