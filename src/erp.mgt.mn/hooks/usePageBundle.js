import useBundleResource from './useBundleResource.js';

export default function usePageBundle(params = {}) {
  return useBundleResource('/api/page_bundle', params);
}
