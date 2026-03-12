import useBundleResource from './useBundleResource.js';

export default function useRelationSearch(table, params = {}, options = {}) {
  return useBundleResource(`/api/relations/${encodeURIComponent(table)}`, params, options);
}
