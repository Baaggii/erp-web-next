import useBundleResource from './useBundleResource.js';

export default function useBootstrap(params = {}) {
  return useBundleResource('/api/bootstrap', params);
}
