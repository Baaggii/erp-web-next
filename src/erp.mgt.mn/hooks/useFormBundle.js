import useBundleResource from './useBundleResource.js';

export default function useFormBundle(params = {}, options = {}) {
  return useBundleResource('/api/form_bundle', params, options);
}
