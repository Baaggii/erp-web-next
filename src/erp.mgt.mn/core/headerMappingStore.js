import { cachedFetch } from './apiCache.js';

export async function fetchHeaderMappings(headers = [], lang = '') {
  const unique = Array.from(new Set(headers.filter(Boolean)));
  if (!unique.length) return {};
  const params = new URLSearchParams({ headers: unique.join(',') });
  if (lang) params.set('lang', lang);
  try {
    return await cachedFetch(`/api/header_mappings?${params.toString()}`);
  } catch {
    return {};
  }
}
